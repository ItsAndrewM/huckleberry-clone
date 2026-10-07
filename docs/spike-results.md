# Step 0 spike — results

Gate for M1 (see `implementation-plan.md` §2). M1 starts only when every row below has a recorded result and the S1/S2 fallback decision is made.

The spike code lives in `spike/`. It is throwaway and will be deleted once this page is complete. Run it with `cd spike && pnpm install && pnpm test`.

## Status

| # | Check | Where it runs | Status |
|---|---|---|---|
| S1 | Installed PWA sign-in survives kill/reopen and forced expiry | Deployed + both iPhones | **Pending** (needs Zero Trust org and devices) |
| S2 | WebSocket upgrade from installed PWA authenticates; `ctx.access` present on upgrade | Deployed + iPhone | **Pending**. Server side is ready (`/api/ws` and `/api/spike/identity` echo the `upgrade` header) |
| S3 | `opaqueredirect` on expiry vs `TypeError` offline | Deployed + iPhone | **Pending**. Harness button "S3" in the spike page |
| S4 | Does Access gate Static Assets? Does the SW-cached shell open offline / signed out? | Deployed + iPhone | **Pending**. Locally the shell is served with no identity (expected: assets bypass the Worker) |
| S5 | `access.dev` stub works; removing it → 401. Service token identity distinguishable | Local ✅ / Deployed (service token) pending | **Local half passes** |
| S6 | Effect 4 `http-api` + `@effect/sql-sqlite-do` in a DO with a `transactionSync` core; bundle size | Local | **Pass** |
| S7 | Hibernation keeps tags; `getWebSockets(tag)` closes by caregiver | Local (workerd eviction) | **Pass** locally; re-confirm on deploy |
| S8 | PITR bookmark → restore on a test DO | Deployed | **Pending**. Local workerd has no PITR backend (see below) |

## Pinned versions

The spike uses these exact versions. M1.1 copies them into the root `package.json` when the monorepo is scaffolded.

| Package | Version | Note |
|---|---|---|
| `effect` | 4.0.1 | `http-api` is `effect/http-api`, router/server is `effect/http`, SQL is `effect/sql` |
| `@effect/sql-sqlite-do` | 4.0.1 | |
| `wrangler` | 4.148.0 | |
| `@cloudflare/workers-types` | 5.20261006.1 | |
| `@cloudflare/vitest-pool-workers` | 0.22.0 | Requires `vitest` ^4.1; **not** compatible with vitest 5 |
| `vitest` | 4.1.11 | |
| `typescript` | 5.9.3 | |
| Node | 22.22.0 | pnpm 10.28.0 |
| `compatibility_date` | 2026-08-22 | Newest date the workerd inside `vitest-pool-workers` 0.22.0 accepts. Raise it when the pool catches up |

## Results

### S5 — local Access stub (local half: pass)

Run with `wrangler dev`, results from `curl`:

| Request | `access.dev.identity` set | `identity` removed |
|---|---|---|
| `GET /api/spike/identity` | 200, `{"aud":"spike-local-aud","identity":{"email":"andrew@example.test",...}}` | **401** |
| `GET /` (shell) | 200 | 200 |
| `GET /api/me`, email not in `caregivers` | 401 (unknown email gets no data) | 401 |
| `GET /api/admin/...` as a caregiver | 403 | 401 |
| `GET /api/login?return=//evil.test` | 302 → `/` | 401 |

**Finding:** `@cloudflare/vitest-pool-workers` 0.22.0 does **not** apply `access.dev` from `wrangler.jsonc`; `ctx.access` is `undefined` inside the pool. Worker-entry tests therefore call the default export's `fetch(request, env, ctx)` with a hand-built `ctx.access` (see `spike/test/spike.test.ts`, `withAccess`). Production M1.4 tests should do the same. It is more deterministic anyway and covers the "no `ctx.access`" path. No `DEV_IDENTITY` fallback is needed.

**Still to do (deployed):** create an Access service token, call `/api/spike/identity` with `CF-Access-Client-Id`/`CF-Access-Client-Secret`, and record the identity shape. The spike's admin gate assumes the token's name arrives as `common_name`. If it doesn't, fix the field in `serviceTokenName` (`spike/src/index.ts`) and record the real shape here.

### S6 — Effect http-api + sql-sqlite-do + `transactionSync` (pass)

- `HttpApiBuilder.layer(Api)` + `HttpRouter.toWebHandler(..., HttpServer.layerServices)` runs inside a DO. `layerServices` supplies a no-op FileSystem, so no Node APIs are needed and no `nodejs_compat` flag.
- Handlers call a synchronous core wrapped in `Effect.sync(() => ctx.storage.transactionSync(...))`. Reads through `SqlClient` (`@effect/sql-sqlite-do`) work in the same DO without interference.
- 50 concurrent read-modify-write requests from two caregivers → counter 50, version 51, no lost updates.
- Two concurrent writes carrying the same `version` → one 200, one 409 `{_tag:"Conflict", code:"STALE_VERSION"}` (AC 13 shape).
- Replaying an `actionId` returns the stored response and writes nothing (AC 14 shape).
- A throw after the write inside `transactionSync` rolls back both the write and the receipt and returns 500.
- Malformed payload → 400 from schema decoding at the edge.
- **Bundle:** 1,127 KiB raw / **228 KiB gzip** with Effect `http-api` + `sql` included. That is far below the Workers limit (3 MiB free / 10 MiB paid, compressed). Baseline for the M1.1 CI size check: **fail above 400 KiB gzip** for M1, and revisit as features land.

**Finding for D2:** `@effect/sql-sqlite-do`'s `withTransaction` uses the async `storage.transaction()` and holds a connection semaphore. It documents that concurrent sibling transactions are unsupported. **Do not use `withTransaction` for mutations.** Mutations go through `ctx.storage.transactionSync` exactly as D2 says. `SqlClient` is optional and only for reads; dropping it entirely is also fine.

### S7 — WebSocket hibernation (pass locally)

- `ctx.acceptWebSocket(server, ["caregiver:<id>"])` + `serializeAttachment` works. `getWebSockets("caregiver:<id>")` returns only that caregiver's sockets, and closing them (code 4401) leaves the other caregiver connected.
- `evictDurableObject(stub)` (default `webSockets: "hibernate"`) tears down the instance while the client socket stays open. The next message wakes a **new** instance (different in-memory id), and the attachment and tags are intact. The woken instance can still close by tag.
- A socket upgrade for an unknown caregiver → 401.
- Re-confirm on the deployed Worker as part of S2 (leave the PWA idle > 10 s, then send).

### S8 — point-in-time recovery (pending, deploy needed)

Locally, `getCurrentBookmark()` returns `00000000-00000000-00000000-00000000000000000000000000000000` and `getBookmarkForTime()` throws *"This Durable Object's storage back-end does not implement point-in-time recovery."* Must be run against a deployed DO.

Note for the runbook: `onNextSessionRestoreBookmark()` takes effect only after the DO restarts. The spike calls `ctx.abort()` straight after, so the admin RPC caller sees an error even when the restore succeeded. M5.3's script should treat that as expected and verify by reading data back.

## Remaining checks — how to run them

Needs Andrew's Cloudflare account. The Cloudflare connector was unavailable in the session that built the spike.

1. **Zero Trust:** create the org if needed, add Google as an IdP, then create an Access application for the Worker's `workers.dev` hostname. Use "previews and production", the maximum session duration, and a policy that allows exactly the two emails. Create a service token (for S5/D6) and add a Service Auth policy for it.
2. **Deploy:** `cd spike && pnpm install && pnpm run deploy`. Set `ADMIN_SERVICE_TOKEN_CN` in `wrangler.jsonc` to the token name first. Then seed both caregivers with the service token: `curl -X POST -H "CF-Access-Client-Id: …" -H "CF-Access-Client-Secret: …" -d '{"id":"cg-andrew","email":"…"}' https://<host>/api/admin/caregiver/seed` (repeat for Emily).
3. **S1–S4 on each iPhone:** open the URL in Safari → Share → Add to Home Screen. Open the installed app and use the spike page buttons (results appear in the on-page log; screenshot them):
   - S1: sign in; kill the app; reopen after 1 h; revoke the session in Zero Trust → reopen → tap "Sign in". Record whether it ends signed in inside the standalone window.
   - S2: tap "open WebSocket" → expect `open` and an echo containing your caregiver id.
   - S3: after revoking the session, tap "fetch /api/me" → expect `type: "opaqueredirect"`. In airplane mode → expect `TypeError`.
   - S4: in airplane mode and when signed out, reopen the app → does the shell load (the "SW-controlled" label)? Check whether `/` is gated by Access when signed out.
4. **S5 service token:** `curl -H "CF-Access-Client-Id: …" -H "CF-Access-Client-Secret: …" https://<host>/api/spike/identity` → paste the identity JSON here.
5. **S8:** with the service token, call `GET /api/admin/pitr/bookmark`, then increment the counter, then `POST /api/admin/pitr/restore {bookmark}`. Then `GET /api/spike/counter` should show the old value.

## Decisions to record before M1

- S1 fallback (Google vs one-time PIN): _pending S1_
- S2 fallback (direct Access on upgrade vs `ws-ticket`): _pending S2_

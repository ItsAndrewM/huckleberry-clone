# Step 0 spike — results

Gate for M1 (see `implementation-plan.md` §2). M1 starts only when every row below has a recorded result and the S1/S2 fallback decision is made.

The spike code lives in `spike/`. It is throwaway and will be deleted once this page is complete. Run it with `cd spike && pnpm install && pnpm test`.

## Status

| # | Check | Where it runs | Status |
|---|---|---|---|
| S1 | Installed PWA sign-in survives kill/reopen and forced expiry | Deployed + both iPhones | **Pending** (needs Zero Trust org and devices) |
| S2 | WebSocket upgrade from installed PWA authenticates; identity present on upgrade | Deployed + iPhone | **Pending**. Server side is ready (`/api/ws`; `/api/spike/identity` reports `via`, `hasCtxAccess`, `hasJwtHeader`, `upgrade`) |
| S3 | `opaqueredirect` on expiry vs `TypeError` offline | Deployed + iPhone | **Pending**. Harness button "S3" in the spike page |
| S4 | Does Access gate Static Assets? Does the SW-cached shell open offline / signed out? | Deployed + iPhone | **Pending**. Locally the shell is served with no identity (expected: assets bypass the Worker) |
| S5 | `access.dev` stub works; removing it → 401. Service token identity distinguishable | Local ✅ / Deployed (service token) pending | **Local half passes**. Docs: service-token JWTs carry the Client ID as `common_name` and an empty `sub` |
| S6 | Effect 4 `http-api` + `@effect/sql-sqlite-do` in a DO with a `transactionSync` core; bundle size | Local | **Pass** |
| S7 | Hibernation keeps tags; `getWebSockets(tag)` closes by caregiver | Local (workerd eviction) | **Pass** locally; re-confirm on deploy |
| S8 | PITR bookmark → restore on a test DO | Deployed | **Pending** (needs the service token). Local workerd has no PITR backend (see below) |
| — | Access + Workers constraints (new) | Docs, then deployed | **Two documented blockers for the plan as written**; see "Access on Workers" below |

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
| `jose` | 6.2.12 | Access JWT verification (WebCrypto, no `nodejs_compat`) |
| Node | 22.x | pnpm 10.x |
| `compatibility_date` | 2026-08-22 | Newest date the workerd inside `vitest-pool-workers` 0.22.0 accepts. Raise it when the pool catches up |

## Deployed environment

- Worker `bt-spike` at https://bt-spike.dinocode.workers.dev in the personal Cloudflare account (`account_id` pinned in `wrangler.jsonc` so it cannot deploy into another account wrangler is logged into).
- `preview_urls: false`, so the `workers.dev` hostname is the only entry point and is exactly what the Access app covers.
- Startup time 31 ms. Bundle 1,164 KiB raw / 238 KiB gzip.
- Before Access is attached, verified with `curl`: `/` and SPA routes → 200 (shell only, no data). Every `/api/*` path → 401, including with a forged unsigned `Cf-Access-Jwt-Assertion` and with a spoofed `x-bt-email`.

## Access on Workers — two documented constraints

From the [Workers Cloudflare Access docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) (updated 18 Aug 2026):

1. **Worker-level Access policies do not support WebSockets.** Upgrade requests to a Worker protected by a worker-level policy fail with 403. A hostname-based self-hosted Access application is required instead. The plan's Step 0 setup ("Access attached at the Worker level") must change to a self-hosted app on the hostname.
2. **Workers with Static Assets do not receive `ctx.access`.** They run behind an internal router Worker that protects the assets but does not pass `ctx.access` to the user Worker. D1 (Static Assets + `run_worker_first: ["/api/*"]`) and D5 (identity from `ctx.access`) conflict.

Spike response, to be confirmed on the deployed Worker:

- The Access app is a self-hosted application on `bt-spike.dinocode.workers.dev`, not a worker-level policy.
- `spike/src/access.ts` prefers `ctx.access` and otherwise verifies the `Cf-Access-Jwt-Assertion` header with `jose`: RS256 only, issuer = team domain, audience = the app's AUD tag, keys from `<team>/cdn-cgi/access/certs`. `/api/spike/identity` reports which path produced the identity (`via`). Unit tests cover valid, wrong audience, wrong issuer, expired, unsigned and tampered tokens.
- If confirmed, D5 changes to: "The Worker verifies the Access JWT (`Cf-Access-Jwt-Assertion`) against the team JWKS and the app's AUD tag." Everything else in D5 stands.

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

**Still to do (deployed):** create an Access service token, call `/api/spike/identity` with `CF-Access-Client-Id`/`CF-Access-Client-Secret`, and record the identity shape. Per the [application token docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/), a service-token JWT has `common_name` = the token's **Client ID** (e.g. `…​.access`) and `sub: ""`. `ADMIN_SERVICE_TOKEN_CN` is therefore the Client ID, which is not secret.

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

Note for the runbook: `onNextSessionRestoreBookmark()` takes effect only after the DO restarts, and `ctx.abort()` throws to its caller by design. The spike splits this into two RPCs: `pitrScheduleRestore(bookmark)` returns the undo bookmark, then `restart()` aborts (its error is expected and ignored). M5.3's script should do the same and verify by reading data back.

## Remaining checks — how to run them

1. **Zero Trust (Andrew, dashboard):** enable Zero Trust on the personal account and pick a team name. Then add Google as a login method (needs a Google OAuth client; the redirect URI is `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`).
2. **Access app (Claude, API):** self-hosted app on `bt-spike.dinocode.workers.dev`, 730 h session, an allow policy for exactly the two emails, a service token with a Service Auth policy, and `service_auth_401_redirect`. Set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ADMIN_SERVICE_TOKEN_CN` (the Client ID) in `wrangler.jsonc` and redeploy. Seed both caregivers through `/api/admin/caregiver/seed` with the service token.
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

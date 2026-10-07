# Step 0 spike — results

Gate for M1 (see `implementation-plan.md` §2). M1 starts only when every row below has a recorded result and the S1/S2 fallback decision is made.

**Gate pending: Emily's S1 one-hour reopen** (due after 00:50 UTC on 8 Oct). Everything else has passed and both fallback decisions are recorded at the end.

Device coverage, decided by Andrew on 7 Oct 2026: S1 checks how iOS keeps the Access session in an installed app, which can differ per phone (iOS version, Safari settings), so it runs on both iPhones. S2–S4 test WebKit and app behaviour that both phones share, so one phone each is enough: S2 on Emily's, S3 and S4 on Andrew's.

The spike code lives in `spike/`. It is throwaway and will be deleted once this page is complete. Run it with `cd spike && pnpm install && pnpm test`.

## Status

| # | Check | Where it runs | Status |
|---|---|---|---|
| S1 | Installed PWA sign-in survives kill/reopen and forced expiry | Deployed + both iPhones | **Andrew's iPhone passes; Emily's pending.** Andrew (Google): install and sign-in, forced expiry with re-login inside the installed app, and a reopen more than an hour later still signed in. Emily (Google): install and sign-in, and forced expiry with re-login inside the installed app, pass; the one-hour reopen is still to run |
| S2 | WebSocket upgrade from installed PWA authenticates; identity present on upgrade | Deployed + iPhone | **Pass** (one iPhone, by decision): desktop Chrome, and the installed PWA on Emily's iPhone (Access JWT verified on the upgrade, socket tagged `cg-emily`). No ticket fallback needed |
| S3 | `opaqueredirect` on expiry vs `TypeError` offline | Deployed + iPhone | **Pass** (one iPhone, by decision; reported by Andrew on his; no screenshot). Signed out, `/api/me` returns 302 to the team login page (cross-origin), which a `redirect: 'manual'` fetch sees as `opaqueredirect` |
| S4 | Does Access gate Static Assets? Does the SW-cached shell open offline / signed out? | Deployed + iPhone | **Pass** (one iPhone, by decision; offline reopen reported by Andrew on his; no screenshot). Access gates everything on the hostname, including `/`, SPA routes and `/sw.js` (302 to login when signed out). Offline, the installed app opens the cached shell |
| S5 | `access.dev` stub works; removing it → 401. Service token identity distinguishable | Local + deployed | **Pass** |
| S6 | Effect 4 `http-api` + `@effect/sql-sqlite-do` in a DO with a `transactionSync` core; bundle size | Local | **Pass** |
| S7 | Hibernation keeps tags; `getWebSockets(tag)` closes by caregiver | Local + deployed | **Pass** (deployed: real hibernation, then close-on-disable from the woken instance) |
| S8 | PITR bookmark → restore on a test DO | Deployed | **Pass** |
| — | Access + Workers constraints (new) | Docs, then deployed | **Confirmed: with Static Assets the Worker gets no `ctx.access`.** D5 must use JWT verification. See "Access on Workers" |

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

Access configuration (all created through the API):

| Item | Value |
|---|---|
| Team domain | `https://misty-wildflower-0505.cloudflareaccess.com` |
| Access app | "BT spike", self-hosted, destination `bt-spike.dinocode.workers.dev` (hostname-based, not worker-level) |
| AUD tag | `c4145355825538d1636f12261872cbdecec07626bb121a3c30309f5a83e07151` |
| Login methods | The "BT spike" app allows Google and One-time PIN, with a choice screen (instant redirect off). S1 uses Google; the PIN stays available as a fallback so S2–S4 can run even if Google fails inside the installed PWA |
| Google login method | Added 7 Oct 2026 with PKCE on. Cloudflare's connection test passed and returned the expected name and email. Google side: project "BT Access" (`bt-access-510920`) in Andrew's personal Google account, OAuth consent screen "Baby tracker" (External, **Testing**, both caregivers listed as test users), Web client "Cloudflare Access" with the team domain as JavaScript origin and `<team domain>/cdn-cgi/access/callback` as redirect URI |
| Policies | "BT caregivers" (allow): armcmillan22@gmail.com, foster.d.emily@gmail.com. "BT admin service token" (service auth): `bt-spike-admin` |
| Sessions | Global 730 h, app 730 h (the one-month maximum) |
| Service token | `bt-spike-admin`, Client ID `92e7b7c0380bafbb8b65a2e3ef4e91b4.access`, expires 2027-10-07. Secret in `spike/.admin-token.env` (gitignored, mode 600) |
| Caregivers seeded | `cg-andrew` → armcmillan22@gmail.com, `cg-emily` → foster.d.emily@gmail.com |

## Access on Workers — two documented constraints

From the [Workers Cloudflare Access docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) (updated 18 Aug 2026):

1. **Worker-level Access policies do not support WebSockets.** Upgrade requests to a Worker protected by a worker-level policy fail with 403. A hostname-based self-hosted Access application is required instead. The plan's Step 0 setup ("Access attached at the Worker level") must change to a self-hosted app on the hostname.
2. **Workers with Static Assets do not receive `ctx.access`.** They run behind an internal router Worker that protects the assets but does not pass `ctx.access` to the user Worker. D1 (Static Assets + `run_worker_first: ["/api/*"]`) and D5 (identity from `ctx.access`) conflict.

Spike response:

- The Access app is a self-hosted application on `bt-spike.dinocode.workers.dev`, not a worker-level policy.
- `spike/src/access.ts` prefers `ctx.access` and otherwise verifies the `Cf-Access-Jwt-Assertion` header with `jose`: RS256 only, issuer = team domain, audience = the app's AUD tag, keys from `<team>/cdn-cgi/access/certs`. `/api/spike/identity` reports which path produced the identity (`via`). Unit tests cover valid, wrong audience, wrong issuer, expired, unsigned and tampered tokens.
- **Confirmed on deploy:** `/api/spike/identity` returned `hasCtxAccess: false`, `hasJwtHeader: true`, `via: "jwt"`. The real Access JWT verified against the team JWKS and AUD.
- The deployed JWT's `aud` was a **string**, while the docs show an array; `jose` accepts both. A service-token JWT's lifetime (`exp - iat`) equals the app session (730 h).

Plan changes this implies (applied to `implementation-plan.md` on 7 Oct 2026):

1. **D5:** "The Worker verifies the Access JWT (`Cf-Access-Jwt-Assertion`) against the team JWKS, the team issuer and the app's AUD tag." Everything else in D5 stands.
2. **Step 0 setup / M1.16:** protect the app with a hostname-based self-hosted Access application, not a worker-level policy (WebSockets).
3. **S4 / threat model:** assets do **not** bypass Access on a hostname app. The shell and `/sw.js` are only reachable signed in, so the service worker installs and updates only while signed in.
4. **D6:** the admin identity is the service token's **Client ID** in `common_name`, not its name.

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

**Deployed (pass):** with `CF-Access-Client-Id`/`CF-Access-Client-Secret`, `/api/spike/identity` returned:

```json
{ "via": "jwt", "hasCtxAccess": false, "hasJwtHeader": true,
  "claims": { "type": "app", "sub": "", "common_name": "92e7b7c0380bafbb8b65a2e3ef4e91b4.access",
              "iss": "https://misty-wildflower-0505.cloudflareaccess.com", "aud": "c4145355…f5a83e07151", … } }
```

- `common_name` is the token's Client ID, matching the [application token docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/). `ADMIN_SERVICE_TOKEN_CN` is therefore the Client ID, which is not secret.
- Wrong secret → 401 (no login redirect, because `service_auth_401_redirect` is on).
- The service token cannot use caregiver routes (`/api/me` → 401: no email). `/api/admin/*` accepts only this Client ID.
- Signed out, every path (assets and API) → 302 to `misty-wildflower-0505.cloudflareaccess.com/cdn-cgi/access/login/bt-spike.dinocode.workers.dev`.

### S2 — WebSocket through Access (pass: desktop and installed iPhone PWA)

**Installed PWA (Emily's iPhone, 20:49 UTC):** `ws: open`, then an echo of "hello" with attachment `{"caregiverId":"cg-emily", …}` about 30 ms later. The upgrade request from the standalone app authenticated through the hostname Access app and the Worker's JWT check. The `ws-ticket` fallback is not needed.

**Desktop:**

A signed-in browser `fetch('/api/spike/identity')` returned `via: "jwt"`, `hasCtxAccess: false`. User-token claims: `email`, `sub` (a stable user UUID), `policy_id` (the "BT caregivers" policy), `country`, `identity_nonce`, `type: "app"`, and `aud` as an **array**. The service token's `aud` was a string. `exp - iat` = 730 h. The WebSocket results are under S7.

### S1 — installed iPhone PWA sign-in (Andrew's iPhone: forced expiry passes)

1. Andrew signed in with Google in Safari (Access log 20:12:20 UTC, `connection: google`), then added the app to the Home Screen.
2. Claude revoked his Access sessions through the API (`POST /access/organizations/revoke_user`, 20:13:54 UTC).
3. Force-quitting and reopening the installed app showed Cloudflare's login page. iOS displays that out-of-scope domain in a minimal in-app browser bar inside the standalone app, not in Safari.
4. He signed in with Google there (Access log 20:16:28 UTC, `connection: google`, allowed). He landed back on the app page reading "(standalone, SW-controlled)", and `/api/me` returned 200 as `cg-andrew`.
5. Inside the standalone app, `/api/spike/identity` returned `via: "jwt"`, `hasCtxAccess: false`, and a token issued at the re-login (`exp - iat` = 730 h).
6. While signed in, "Sign in (/api/login)" just reloads the page: the Worker 302s straight back to the return path.

**Emily's iPhone:** installed the app and signed in with Google (Access log 20:48:21 UTC, `connection: google`, allowed; her token's `iat` matches). The installed app reads "(standalone, SW-controlled)", `/api/me` returns 200 as `cg-emily`, and identity arrives `via: "jwt"` under the "BT caregivers" policy.

**Emily's forced expiry (pass):** Claude revoked her Access sessions at 23:44:34 UTC. She reopened the installed app, signed in with Google (Access log 23:49:53 UTC, `connection: google`, allowed) and landed back inside it: "(standalone, SW-controlled)", `/api/me` 200 as `cg-emily`, identity `via: "jwt"` with `iat` matching the login and `exp - iat` = 730 h.

**Still to run on Emily's iPhone:** a reopen more than an hour after the 23:49:53 UTC sign-in, which should still be signed in.

**One-hour reopen (Andrew's iPhone):** reopened more than an hour after the 20:16:28 UTC sign-in and was still signed in. The Access log shows no further login by Andrew between 20:16:28 and 23:21 UTC, so the installed app kept and reused the Access session cookie across that time.

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
- **Deployed (desktop Chrome, signed in with the one-time PIN as armcmillan22@gmail.com):**
  1. `wss://bt-spike.dinocode.workers.dev/api/ws` opened through the hostname Access app. The Worker verified the Access JWT on the upgrade request, and the DO tagged the socket `caregiver:cg-andrew`. Echo round trip ≈ 40 ms.
  2. After ~40 s idle, the next message was answered by a **different** DO instance (`590c6524…` → `f7c630bb…`). The client socket never closed, and the attachment (`cg-andrew`, email, `connectedAt`) was intact.
  3. `POST /api/admin/caregiver/disable` (service token) returned `closedSockets: 1`. The browser received close code **4401** "caregiver disabled". Re-seeding re-enabled the caregiver and `/api/me` returned 200 again.

### S8 — point-in-time recovery (pass)

On the deployed DO, using the service token:

1. Seeded `cg-andrew` and `cg-emily`. Took bookmark B1 (`00000000-00000008-…`).
2. Seeded `cg-pitr-probe` → caregivers were andrew, emily, probe.
3. `POST /api/admin/pitr/restore {B1}` → `restarted: true` and an undo bookmark.
4. Next read: caregivers were andrew and emily; the probe was gone. The bookmark epoch moved to `00000001-…`.

Locally, `getCurrentBookmark()` returns `00000000-00000000-00000000-00000000000000000000000000000000` and `getBookmarkForTime()` throws *"This Durable Object's storage back-end does not implement point-in-time recovery."* Must be run against a deployed DO.

Note for the runbook: `onNextSessionRestoreBookmark()` takes effect only after the DO restarts, and `ctx.abort()` throws to its caller by design. The spike splits this into two RPCs: `pitrScheduleRestore(bookmark)` returns the undo bookmark, then `restart()` aborts (its error is expected and ignored). M5.3's script should do the same and verify by reading data back. It should also cover an interruption between the two calls, and afterwards revalidate caregiver `active` state and close sockets of caregivers the restore disabled, since a restore can change who is allowed in.

## Remaining checks — how to run them

1. ~~Zero Trust and the Access app~~ (done; see "Deployed environment").
2. ~~Google login method~~ (done; see "Deployed environment"). Cloudflare's [Google IdP steps](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/) leave out one thing: a new External consent screen starts in **Testing**, where only listed test users can sign in. Any future caregiver must be added as a test user, or the app published. Google is now allowed on the "BT spike" app next to the PIN.
3. **S1–S4 on the iPhones** (see Results). S1 runs on both phones; S2–S4 ran on one phone each, by Andrew's decision. Still to do: Emily's S1 one-hour reopen. The steps: open the URL in Safari → Share → Add to Home Screen. Open the installed app and use the spike page buttons (results appear in the on-page log; screenshot them):
   - S1: sign in; kill the app; reopen after 1 h; revoke the session in Zero Trust → reopen → tap "Sign in". Record whether it ends signed in inside the standalone window.
   - S2: tap "open WebSocket" → expect `open` and an echo containing your caregiver id.
   - S3: after revoking the session, tap "fetch /api/me" → expect `type: "opaqueredirect"`. In airplane mode → expect `TypeError`.
   - S4: in airplane mode and when signed out, reopen the app → does the shell load (the "SW-controlled" label)? Check whether `/` is gated by Access when signed out.
4. ~~S5 service token~~ (pass).
5. ~~S8~~ (pass).

## Decisions to record before M1

- **S1 fallback: Google (provisional until Emily's one-hour reopen is in).** Google sign-in works inside the installed app on both iPhones and recovered from a forced logout on both; on Andrew's it also survived a one-hour reopen. The one-time-PIN fallback is not needed so far. The spike's Access app still offers the PIN; M1.16 decides whether production keeps it as a backup.
- **S2 fallback: direct Access on the upgrade request.** The installed PWA's WebSocket upgrade authenticates through the hostname Access app and the Worker's JWT check. No `ws-ticket` endpoint.

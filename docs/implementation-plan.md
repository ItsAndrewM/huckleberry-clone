# Baby tracker — implementation plan

Implements spec **v0.10 (approved 6 October 2026)**. Section references (§n) and acceptance criteria (AC n) point at the spec. This plan follows the spec's delivery order (§12) and splits each milestone into tasks small enough to review as single PRs.

---

## 0. Decisions this plan makes

These either fill gaps in the spec or pick between options it leaves open. Each one says why. Anything here can be overturned in review before M1 starts.

| # | Decision | Why |
|---|---|---|
| D1 | **All API routes live under `/api/*`.** WebSocket at `/api/ws`. | The spec's API paths (`/today`, `/days/:date`) collide with the obvious SPA routes. A prefix also lets Static Assets serve the SPA and send only `/api/*` to the Worker first (`run_worker_first: ["/api/*"]`). |
| D2 | **Every mutation runs as one synchronous function inside `ctx.storage.transactionSync()`.** Effect `http-api` handles decoding, encoding and errors at the edge; the core reads, checks invariants, and writes without any `await`. | The invariants in §3 rely on the Durable Object serializing writes. A synchronous transaction cannot interleave with another request, whatever the HTTP layer does with promises. It also keeps the core testable without Effect. The spike confirms `@effect/sql-sqlite-do` does not get in the way. If it does, fall back to `ctx.storage.sql` with a thin typed helper. |
| D3 | **Feed components (segments, portions) are versioned through their parent feed.** Any change to a segment or portion increments `feeds.version`. `PATCH /segments/:id` and `/portions/:id` take the feed's version. | §8 gives `nursing_segments` and `bottle_portions` no `version` column, but §3 requires every edit to be version-checked. AC 13 (two phones switch side at the same moment) also needs one version for the whole feed. A per-component version would let two segment edits race against the session-bound recompute. |
| D4 | **Add `source` (`app` / `import`) and `source_ref` to every tracking table, with a partial unique index on `(source, source_ref) WHERE source = 'import'`.** M2 was dropped (10 Oct 2026), so every row is `source = 'app'`. The tables through `0006-growth` keep the columns, so a raw-row export stays uniform. Tables added later may leave them out. | §10 requires idempotent re-import "with source row id", but §8 has no column for it. |
| D5 | **The Durable Object resolves identity.** The Worker verifies the Access JWT in `Cf-Access-Jwt-Assertion` with `jose`: RS256 only, issuer = the team domain, audience = the app's AUD tag, keys from `<team>/cdn-cgi/access/certs`. It uses `ctx.access` instead when the runtime provides it, which `vite dev`, `vite preview` and `wrangler dev` do through `access.dev`. It then deletes any client-sent `x-bt-*` headers, sets `x-bt-email` from the verified identity, and forwards to the single household DO (`getByName("household")`). The DO looks up `caregivers` by email and checks `active` on every request. | §8 puts `caregivers` in the DO, so the Worker cannot map email to caregiver without a round trip. Doing the lookup in the DO keeps the per-request `active` check (AC 10) in one place. The JWT check is needed because Workers with Static Assets never receive `ctx.access`: the assets router does not forward it (Cloudflare docs; confirmed in the spike). |
| D6 | **Disable a caregiver with an admin script, not UI.** `pnpm admin caregiver:disable <email>` sends an HTTPS request to `/api/admin/*` with a Cloudflare Access service token kept on Andrew's machine. The Worker accepts `/api/admin/*` only when the verified JWT's `common_name` equals that service token's Client ID, never a caregiver identity, and forwards it to a DO admin RPC method. Service-token JWTs carry the Client ID as `common_name` and an empty `sub` (confirmed in S5). On disable, the DO closes that caregiver's tagged sockets with code 4401 (confirmed in the spike). `pnpm admin caregiver:enable <email>` undoes a disable (decided 9 Oct 2026): the seed runs once, so nothing else could. `pnpm admin caregiver:set-email <current> <new>` moves a caregiver to another email, keeping their id and entries, for a mistyped seed or a new Google account (decided 10 Oct 2026). | The spec requires the capability but describes no UI. With two users, an admin screen is not worth building. |
| D7 | **`today` and `last24h` are invalidated by every mutation.** For other periods the server works out the affected keys with `affectedPeriods(oldInterval, newInterval, tz)` from `packages/domain`. | This is always correct and cheap at this data volume. Working out exactly when Today is affected is error-prone and saves nothing. |
| D8 | **`supplement_logs.local_date` is recomputed for every row in the same transaction as a household timezone change.** Editing `occurred_at` also recomputes it. | `local_date` is stored, so a timezone correction would otherwise leave the duplicate check and daily status using stale dates. |
| D9 | **No two non-deleted nursing segments may overlap, across all feeds** (one child, one breast-at-a-time). Overlap with sleep, diapers, and so on is allowed. | §3 says to "reject overlapping segments" without saying in what scope. |
| D10 | **Restore re-runs every invariant.** A restore that would break an invariant, such as a second active sleep or an overlap, returns 409 with the conflicting record. Where a partial unique index stands behind a check, as `feeds_one_active` does for the active feed, the check runs first, so a violation is a defect, answered with a logged 500 and nothing written (decided in M1.7). | Soft-deleted rows are excluded from the checks, so bringing one back can create a conflict. |
| D11 | **Ambiguous local times (DST fall-back) in manual entry show a two-choice "1:30 (first) / 1:30 (second)" picker. Nonexistent times (spring-forward) are rejected with a message.** No other DST UI. | §5 requires explicit offset selection for repeated times but defers the grid labels. This is the smallest form-level version. |
| D12 | **Tooling:** pnpm workspaces, TypeScript strict, oxlint (lint, with the anti-slop and `@gamesheet-inc/oxlint-plugin` rules) and oxfmt (format), Vitest, `@cloudflare/vitest-plugin` for Worker/DO tests, Playwright (WebKit + Chromium, iPhone viewport) for E2E. Time zones via `@date-fns/tz` and `date-fns`, inside `packages/domain` only. | These are conventional, fast, and run in CI without devices. |
| D13 | **Prefill values come from the server** in `GET /api/today`: last bottle amounts and milk mix, last nursing side, last supplement. | Prefill then follows whichever parent logged last, and the client needs no local storage. |

---

## 1. Repository layout

```
apps/
  web/                 React 19 + Vite + @cloudflare/vite-plugin, TanStack Router/Query, shadcn (Base UI) + Tailwind
    src/api/           the household's API client, error taxonomy, connectivity, query client, ws client; mutations (M1.12)
    src/shell/         router, layout, tab bar, connection banners
    src/theme/         System, Light or Dark, kept per phone
    src/components/ui/ shadcn components on Base UI
    src/timer/         the one-second clock (useNow, M1.11); timer UI primitives (M1.12)
    src/features/      today, feed, sleep, diaper, supplement, growth, history, trends, settings
    src/service-worker/ service worker (assets only): its routes, saved copy and registration (M1.14)
  worker/
    src/index.ts       Worker entry: Access check, header hygiene, forward to DO
    src/household.ts   HouseholdDO: http-api handler, websocket hibernation, RPC admin methods
    src/core/          synchronous mutation/query core (per domain), transaction helpers
    src/db/            migrations (numbered .sql), row mappers
packages/
  domain/              pure TS, no framework imports: units, time/tz, intervals, timer math, aggregation,
                       validation, percentiles (LMS), affectedPeriods
    data/who/          WHO's girls' expanded tables (days 0–730), lms-girls.json and MANIFEST.json (source URL, dataset id, sha256); pnpm who:tables rebuilds them (M4.1)
  contracts/           Effect Schema request/response/error types, query-key definitions
e2e/                   Playwright specs
scripts/               Node tooling and its tests; pnpm admin (seed the household; disable, enable and re-email caregivers;
                       PITR bookmarks and restores) and pnpm release (M1.16)
docs/                  spec, this plan, runbooks (production, Access and deploys in runbooks/access.md; restore drill)
```

`packages/domain` imports nothing else from the workspace. `packages/contracts` may import `domain`, whose predicates its schemas call. `apps/web` and `apps/worker` import both.

---

## 2. Step 0 — spike (gate)

Nothing in M1 starts until every item has a recorded result in `docs/spike-results.md`.

**Setup:** a Zero Trust organization, a Google IdP in Access, and a throwaway Worker with a Durable Object, Static Assets, and a service worker. Deploy to a `workers.dev` URL protected by a self-hosted Access application on that hostname, not a worker-level policy: worker-level policies reject WebSocket upgrades with 403. Turn `preview_urls` off so the hostname the app covers is the only entry point. Session duration is the maximum allowed. The policy allows exactly the two emails.

| # | Check | Pass | If it fails |
|---|---|---|---|
| S1 | Installed PWA on both iPhones: install, sign in through Google, kill the app, reopen after 1 h, reopen after forced session expiry (revoke in Zero Trust) | Opens signed in. After expiry it gets back to signed in from inside the standalone app | Switch the Access login method to one-time PIN (same allowlist) and repeat S1. If OTP also fails, stop and revisit §6 |
| S2 | WebSocket upgrade from the installed PWA authenticates through Access, and the Access JWT on the upgrade request verifies (D5) | Socket opens; DO sees the email | Authenticate the socket with a short-lived ticket minted by `GET /api/ws-ticket`, which is an ordinary Access-protected fetch |
| S3 | After expiry, `fetch('/api/me', { redirect: 'manual' })` returns `type === 'opaqueredirect'`; airplane mode returns `TypeError` | Both are distinguishable | Treat 401/403 and any cross-origin redirect as auth-required. Record what Access actually returns |
| S4 | Does Access gate Static Assets requests, or only requests that reach the Worker? Does the service-worker-cached shell open offline and when signed out? | Documented. The shell opens offline | If assets bypass Access, that is acceptable (the shell holds no data). Record it in the threat model |
| S5 | `wrangler dev` `access.dev` stub identity works; removing it yields 401. An Access service token reaches the Worker with a distinguishable identity (D6) | Yes | Inject a dev identity in the Worker under a `DEV_IDENTITY` env var guarded to local only |
| S6 | Effect 4 `http-api` + `@effect/sql-sqlite-do` inside a DO, with a handler that calls `transactionSync` (D2). Measure the compressed Worker bundle | Works; bundle well under the plan limit | Plain router (Hono or hand-rolled) + Effect Schema for validation only |
| S7 | DO WebSocket hibernation: tags survive hibernation; `getWebSockets(tag)` closes by caregiver | Yes | Keep a caregiver→socket map rebuilt from attachments on wake |
| S8 | Point-in-time recovery API callable on a test DO (bookmark → restore) | Yes | Fall back to a nightly JSON export to R2 and document that |

Deliverables: `docs/spike-results.md`, pinned versions in the root `package.json`, and a decision on S1/S2 fallbacks before M1.

---

## 3. Cross-cutting foundations (built in M1, used everywhere)

### 3.1 `packages/domain`

Pure functions. Each takes `now` and `tz` as arguments; nothing reads the clock or the device timezone.

- `time/` — `Instant` (epoch ms, UTC), `LocalDate`, `zonedDayBounds(date, tz)`, `localDateOf(instant, tz)`, `isoWeekBounds`, `monthBounds`, `resolveLocal(dateTime, tz) → {kind: 'ok'|'ambiguous'|'nonexistent', ...}` (D11), `startOfDate(date, tz)` (the first instant of a local date, which isn't always 00:00), `canonicalTimeZone(name)` (seed script, Settings). Functions that take a date, week, month or zone string throw `RangeError` when it isn't real; `canonicalTimeZone` returns `null` instead, and `isLocalDate`, `isIsoWeek` and `isYearMonth` return a boolean, so callers can test a string without catching.
- `interval/` — half-open `[start, end)` intervals: `overlaps`, `contains`, `splitByDays(interval, tz)`, `clipTo(period)`.
- `timer/` — `nursingElapsed(segments, now)` (sum of closed + open), `sleepElapsed(session, now)`, `formatElapsed`.
- `feed/` — `feedSummary(feed, now)` → left/right/total seconds, breast-milk/formula/total mL. `sessionBounds(components)`.
- `aggregate/` — `totalsIn(period, feeds, diapers, now)` totals any period: a local day (`zonedDayBounds`) or the last 24 hours (`last24hPeriod`, which has no end). Later: `weekSummary`, `monthSummary`, `cumulativeSeries`, `longestSleepStretch`, `supplementStatus`. Nursing and sleep are allocated by interval overlap with the period. Bottles are allocated by portion time. Feeds are counted by their start.
- `validate/` — positive volume (≤ 1 decimal, finite), positive duration, end > start, not before birth, `notInFuture(instant, serverNow, toleranceMs = 5 min)`, ounces ∈ [0, 16).
- `units/` — g ↔ lb+oz, cm ↔ in using the exact constants. Values are stored at full precision and rounded for display only. Bottle volumes convert between mL and US fl oz and are stored to 0.1 mL.
- `growth/` — `girlsLms(metric, ageDays) → {L, M, S} | null` from the bundled WHO tables, days 0–730 (M4.1), `ageInDays(measuredOn, birthDate)` (whole calendar days between two local dates: chronological age, decided 10 Oct 2026) and `ageInMonthsAndDays(measuredOn, birthDate)` (calendar months, then days, or `null` before the birth date: M4.5's table), `zScoreLMS(value, lms)` with WHO's restricted application beyond ±3 SD, `percentile(z)` (the normal CDF, 0–100), and `zScoreFor` and `percentileFor(metric, sex, ageDays, value) → number | 'unavailable'`, which take weight in grams and lengths in cm (M4.2, `docs/percentiles.md`), and `valueAtPercentile(metric, sex, ageDays, percentile)`, `percentileFor`'s inverse, which draws WHO's 3rd, 15th, 50th, 85th and 97th curves in the same units (M4.5).
- `invalidation/` — `affectedPeriods(old: Interval | null, new: Interval | null, tz) → PeriodKey[]` (D7): the day, week and month keys. A point event is `{start: t, end: t}`.

`pnpm coverage` (in CI) holds this package at 100 % statement, branch, function and line coverage. It is small, and most correctness lives here.

### 3.2 `packages/contracts`

- Effect Schemas for every request/response, plus `ApiError = Unauthorized | InvalidInput{fieldErrors} | NotFound | Conflict{code, current} | RateLimited | ServiceUnavailable`. M1.3 builds the shared pieces: `Instant` (integer epoch ms in 2000–2099), `LocalDate`, `IsoWeek` and `YearMonth` (years 1999–2100), `TimeZone`, the errors and the query keys. Each endpoint's schemas come with the task that builds it. M1.6 adds `Version` (an integer from 1) and `VersionedAction` (`{actionId, version}`), the body of every delete and restore. A conflict is declared per record type, with `Conflict<Self>()(identifier, codes, current)`. The identifier names its schema in `docs/api.json`, and every conflict still says `Conflict` on the wire. `fieldErrors` is a list of `{path, issue}`, where `issue` is a domain `ValidationIssue` or `invalid`.
- Stable conflict codes: `FEED_ALREADY_ACTIVE`, `SLEEP_ALREADY_ACTIVE`, `SLEEP_OVERLAP`, `SEGMENT_OVERLAP`, `STALE_VERSION`, `SUPPLEMENT_DUPLICATE_DAY`, `FEED_EMPTY`, `ACTION_REPLAY_MISMATCH`.
- Query-key builders, shared by the server's `changed` list and the client's invalidation: `['me']`, `['today']`, `['last24h']`, `['day', '2026-10-06']`, `['week', '2026-W41']`, `['month', '2026-10']`, `['growth']`, `['deleted']`. The day, week and month keys are `@bt/domain`'s `PeriodKey`.
- Today's `recent` is `RecentEntries` (M1.11): it skips any entry the app can't read, such as a kind added after the app was built, as the socket's `changed` keys do. An installed app running older code then still shows Today.
- `OpenAPI` generated from the http-api definition and checked into `docs/api.json` as a review aid. `pnpm api:docs` writes it, and a test fails while it's stale. The http-api definition starts in M1.5, with `GET /api/me`.

### 3.3 Durable Object core

- **Migrations:** numbered SQL files applied in the DO constructor inside `blockConcurrencyWhile`, tracked in a `_migrations` table. A household whose ledger names a migration differently from the code, at the same position, refuses to start. Migration 0001 creates the household, caregivers, child and receipts tables. Each feature then adds its own numbered migration with its tables, D4 columns, partial unique indexes and `*_at` indexes (decided 8 Oct 2026, since §8 isn't in the repo). Interval tables also get a composite index on `(started_at, ended_at)` for the day-intersection query `started_at < :end AND (ended_at IS NULL OR ended_at > :start)`.
- **Seed:** an admin script (`pnpm admin household:seed`) creates the household (name, timezone), two caregivers, and the child profile with name, birth date, sex = female, and gestational age = 281 days. It seeds once; running it again changes nothing. Local runs seed a made-up household from `env.local` in `wrangler.jsonc`. Nothing in source holds production child values; they are passed as script arguments.
- **Mutation pipeline:** `decode → identity (caregiver active) → transactionSync(receipt lookup by actionId; if found return the stored response, otherwise run core, compute changed keys, and insert the receipt) → respond → broadcast {changed} to every open socket`, the caller's own included, so a parent's other devices hear the change too (decided 9 Oct 2026). Each receipt stores its route (`METHOD /path`) and a hash of the route and the canonical request body. An `actionId` that comes back on another route gets 400 `InvalidInput` on `actionId`. A hit with the same hash returns the stored response. A hit with a different hash means the parent edited the form after a save whose response was lost. That returns 409 `ACTION_REPLAY_MISMATCH` with the saved record, and the UI says "This was already saved" and offers to apply the new values as an edit. Rotating the `actionId` on edit is wrong, because it would create a duplicate if the first save had committed. A receipt hit with the same hash also rebroadcasts its stored `changed` keys, so a retry repairs a broadcast lost when the original request died after commit. A hit with a different hash, or on another route, broadcasts nothing. The receipt is written in the same transaction as the mutation, so a crash between them cannot leave a mutation without its receipt.
- **Clock:** core functions take `now`, and the DO reads `Date.now()` where a request or alarm comes in. Tests pin it with Vitest's fake `Date`, which reaches the DO in the test pool.
- **Receipts:** stored with the serialized response and its `changed` keys. They are pruned with a DO alarm, rescheduled every 6 h, that deletes rows older than 24 h. The client's retry window for one `actionId` is **12 h**, half the retention: a form draft older than that gets a fresh `actionId` and asks the parent to confirm before saving ("This entry is from yesterday — save it now?"). Retention is always longer than the retry window, so a pruned receipt can never be replayed.
- **Audit:** `created_by/at` is set on insert. `updated_by/at` are set on every update, including soft delete and restore. `version + 1` applies to the tables that have a `version` column, which include the household and the child from M1.15. Edits to `nursing_segments` and `bottle_portions` increment the parent `feeds.version` instead (D3).

### 3.4 Web client foundations

- `api/client.ts`: Effect's `HttpApiClient`, built from the contract's `Api`, so each endpoint's path, payload and errors come from `contracts` (M1.10). It always sends `redirect: 'manual'` and `credentials: 'same-origin'`, and maps outcomes to `AuthRequired` (opaqueredirect), `Offline` (TypeError, no response), `ServiceUnavailable` (a 503: retry, don't sign in again), or the endpoint's own typed `ApiError`.
- `api/connectivity.ts`: one store with the states `online | offline | auth-required`, fed by fetch outcomes, `online`/`offline` events, and socket state. It also remembers when the household last answered a request or spoke on the socket, which No connection shows as "Updated 9:42 PM" (M5.4). A household 401 and the socket's 4401 also mean signed out, and offline wins over auth-required, since signing in needs the network (M1.10). It drives the "No connection" bar and the "Sign in to continue" banner. Before navigating away (from M1.12, which builds the forms), the app saves the open form to `sessionStorage` as `{route, values, actionId, createdAt}` (form drafts only, never records). "Sign in" then does a top-level navigation to `/api/login?return=<current route>`. Access intercepts that request, runs Google sign-in, and sends the browser back to `/api/login`. The Worker handles `/api/login` once authenticated: it accepts `return` only if it is a same-origin path (otherwise `/`) and 302s there. The SPA loads at that route, finds the draft, reopens the sheet with its values, and re-sends with the same `actionId` if the draft is within the 12 h retry window (see Receipts). Then it clears the draft.
- TanStack Query: `staleTime` ≈ 5 s, `refetchOnWindowFocus`, `refetchOnReconnect`, and `networkMode: 'always'` so failures surface as our typed errors. `useMe` compares the email with the previous one and, on a change, drops every cached query but `me` (M1.10).
- `api/live-connection.ts`, with `api/live.ts` (M1.10): connects on app start and reconnects with capped exponential backoff (1 s → 30 s, with jitter), at once when the browser comes back online. On `{changed}` it calls `invalidateQueries` for each key it can decode, skipping kinds it doesn't know. A message it can't read invalidates everything. After a reconnect it invalidates everything active. It sends the heartbeat (`ping`, which the household answers with `pong` without waking) every 30 s, and drops a socket whose ping is still unanswered at the next beat. A 4401 close stops it and signs out.
- Optimistic creates: `onMutate` inserts a `pending` record into the `today` (and day) cache and recomputes the preview summary with `domain` functions. `onError` rolls back and reopens the sheet with its values and reason. `onSettled` invalidates.
- Forms: bottom sheets (shadcn Drawer on Base UI). A form's state lives in the sheet component and survives failed requests. The `actionId` is generated when the sheet opens and reused for every retry of that submission.
- Theme: Tailwind tokens written with `light-dark()`, so System follows `prefers-color-scheme` without JavaScript. A Settings override (System, Light or Dark, kept per phone) sets `data-theme`, which a script in `index.html` applies before the first paint (M1.10). Dark mode ships in M1 (§2).

### 3.5 Shared timer engine (web + server)

- **Server:** timer state is rows (D2/D3). Shared core helpers are `openInterval`, `closeInterval(at)`, and `correctInterval`. Feed and sleep adapters add their own validation.
- **Client:** `useNow()` (M1.11) is a clock that ticks as each second begins, read through `useSyncExternalStore`. Elapsed time comes from the server's timestamps through `feedSummary` and `formatElapsed` for a running or paused feed; the time since the last feed counts from its `startedAt`. The clock only redraws. TanStack Query's `refetchOnWindowFocus` refetches on `visibilitychange → visible`; nothing there sends a mutation. A lint rule (oxlint `no-restricted-imports`, or a grep check in CI) blocks `pagehide`/`beforeunload`/`visibilitychange` handlers in mutation modules. It lands with the first mutation module, in M1.12.
- Shared UI: `TimerDisplay`, `TimerControls`, `StopTimeCorrection` (edit the stop time before confirming), `ActiveTimerCard`. M1.11's feed card shows a running or paused feed; the controls come with M1.12's sheets.
- The shared lifecycle test suite (§6, AC 20) is parameterized over `['nursing', 'sleep']`.

---

## 4. Milestones

Sizes are relative (S ≈ ≤ 1 day, M ≈ 2–3 days, L ≈ a week) for one developer.

### M1 — Core: bottle, diaper, nursing timer, Today, live updates, dark mode

Goal: both parents use it daily. Covers AC 1–5, 10, 11, 13, 14, 20 (nursing half), 21, 25.

| Task | Size | Notes |
|---|---|---|
| M1.1 Monorepo scaffold, Biome (since replaced by oxlint and oxfmt, D12), Vitest, CI (typecheck, lint, unit, workers tests, Playwright on Chromium + WebKit) | S | GitHub Actions; `wrangler deploy --dry-run` with a bundle-size check against the S6 baseline |
| M1.2 `domain`: time/interval/timer/feed/validate/units/invalidation + tests | M | Fixtures for midnight split (AC 4) and DST (AC 21) days in `America/*` and `Europe/*` zones |
| M1.3 `contracts`: schemas, errors, query keys | S | Shared pieces only (§3.2). Endpoint schemas come with their endpoints |
| M1.4 Worker entry: Access JWT verification (D5) → 401, header hygiene, forward to DO; `access.dev` in `wrangler.jsonc` | S | Port `spike/src/access.ts` (removed in M1.1; `git show ac49adb:spike/src/access.ts`). Test: no `ctx.access` and no valid JWT → 401; unsigned, tampered, expired, wrong-issuer and wrong-audience JWTs → 401; spoofed `x-bt-email` is stripped; `/api/login?return=` redirects only to same-origin paths; `/api/admin/*` rejects caregiver identities and every service token except the admin Client ID. The test pool ignores `access.dev`, so tests pass `callerOf` the Access context. Missing or empty Access settings refuse every token. Keys out of reach → 503. A minimal `HouseholdDO` answers 404 until M1.5 |
| M1.5 DO skeleton: migrations, seed script, identity resolution, receipts, alarm pruning, `GET /api/me` | M | Starts the http-api definition in `contracts` and `docs/api.json`. Maps decode failures, which Effect answers with an empty 400, to `InvalidInput`. Migration 0001 holds the household, caregivers, child and receipts. A household call that rejects → 503 |
| M1.6 Diapers: POST/PATCH/DELETE/restore + core | S | A diaper is its time, wet and dirty (decided 9 Oct 2026); wet or dirty required. An edit sends every field, and each endpoint answers `{ diaper, changed }`. Receipts keep their route, and migrations check their names |
| M1.7 Feeds core: manual completed feed, start, switch, pause, resume, bottle, finish; segment/portion PATCH/DELETE; feed PATCH/DELETE/restore; session bounds recompute; D3, D9 | L | A feed is its nursing segments and bottles (decided 9 Oct 2026). A live feed always keeps one: a finish corrected back to the running side's start, or deleting the last segment or bottle, answers `FEED_EMPTY` unless `deleteIfEmpty: true` deletes the feed as it stands. A running side counts as reaching 5 minutes past now for D9 |
| M1.8 `GET /api/today` and `GET /api/last24h`: summaries, active feed/sleep, last feed, prefill values (D13), recent entries with caregiver | M | Today is the household's local day: its totals, the active and last feed, D13's last bottle and last side, and every feed and diaper from the last 24 hours, newest first. A feed counts on the day it started, which is the "Feeds started today" label. `last24h` is the same totals from 24 hours before now, with no end (decided 9 Oct 2026). Caregiver names come once, in `/api/me`. Active sleep and the last supplement come with their tables (M3.1, M3.3) |
| M1.9 WebSocket: hibernation accept, tag by caregiver, broadcast `changed`, close on disable (D6) | S | Every open socket hears every change, the caller's own included (decided 9 Oct 2026). The household answers the `ping` heartbeat without waking. `pnpm admin caregiver:enable` undoes a disable |
| M1.10 Web shell: router (Today, History stub, Trends stub, Growth stub, Settings), theme, connectivity store, fetch wrapper, ws client, auth/offline banners | M | The client is Effect's `HttpApiClient`, built from the contract. A household 401 or a socket 4401 means signed out. The theme is System, Light or Dark per phone. The form draft kept across sign-in and the `pagehide` lint guard move to M1.12, with the forms |
| M1.11 Today screen: status cards (last feed + "Since last feed started", today's totals, diaper counts), quick-action bar, recent list | M | Designed for a one-glance read after unlock. The feed card counts from the last feed's start, or shows the running or paused feed. The totals switch between today and the last 24 hours, opening on today (decided 10 Oct 2026). The recent list skips kinds the app doesn't know. The quick-action bar waits for M1.12's sheets |
| M1.12 Sheets: Bottle (steppers ±10 mL / 0.5 oz, prefilled, one-tap save), Diaper (Pee / Poo / Both, 1 tap each = 2 taps from Today), Nursing (start L/R, pause/resume, switch, add bottle, finish with stop-time correction), manual feed entry and backdating | L | Tap-budget E2E tests count interactions (AC 2). AC 11's offline E2E moved here from M1.14 (decided 9 Oct 2026): open offline, show the last Today (kept in memory or Query cache for the session), keep the form, Retry once |
| M1.13 409 UX: "Emily changed this a moment ago" with Reload / Reapply; active-feed conflict prompt (§3 nursing) | S | |
| M1.14 Service worker (assets only; precache build output; network-only for `/api/*`), manifest, icons | S | Access gates the shell and `/sw.js` (S4), so the service worker installs and updates only while signed in. It saves `/` and the build's `assets/`, tries the network first for pages, and stays out of `/api/*`, so Sign in and every household call reach the network. An install whose files don't all arrive as this build's fails, so the previous copy stays. Offline E2E: the app and any tab's address open from the saved copy. AC 11's full flow moved to M1.12, which builds the forms (decided 9 Oct 2026) |
| M1.15 Settings minimum: child profile, household timezone, units, signed-in account | S | Units are one household setting: mL or fl oz, kg, g or lb & oz, and cm or in (decided 9 Oct 2026). `PATCH /api/household` and `PATCH /api/child` edit the two records, each versioned, and `GET /api/me` carries both whole. A birth date can't be after today or after the earliest entry. A save that meets the other phone's newer copy reapplies its own change once. Changing the timezone runs D8 |
| M1.16 Deploy: production Access app (self-hosted on the app hostname, not worker-level), Google IdP (or OTP per S1), allowlist policy, admin service-token policy, 730 h app and global session, `preview_urls: false`; install on both phones | M | Runbook in `docs/runbooks/access.md`. **Hostname:** production is https://baby.andamonium.dev, a Custom Domain with workers.dev and preview URLs off (decided 10 Oct 2026). **Access:** Claude created the "Baby tracker" Access app through the API (Google only, 730 h, `SameSite=Lax`), and Andrew created the admin service token. **Prep PR, before any deploy:** `pnpm release` (a clean `main` with green CI, a fresh build whose config passes `release-checks`, a PITR bookmark, then the deploy, logged to `deploys.log`), `pnpm admin pitr:restore`, `caregiver:set-email`, an exact-Origin check on `/api/ws`, and logs that say why a request was refused or failed but never hold a token or an email. Workers Logs keeps those, with per-request records off. **Order:** the first deploy follows that PR, with M1.11's Today and ahead of M1.12 and M1.13. Its phone checks and a first restore drill run on the still-empty household |

**Exit:** both phones are in daily use for about a week. Bugs found in that week are fixed before M3 work starts.

### M2 — CSV import (dropped)

Dropped on 10 Oct 2026: nothing gets imported. The household starts fresh on deploy day, and the old app keeps its records. AC 24 is out of scope. M2.1 to M2.4 (mapping, preview, confirm, Settings › Import) won't be built.

### M3 — Sleep, supplements, full history editing, calendar, summaries, export

Covers AC 6, 7, 12, 15 (export half), 16–20, 22, 23.

| Task | Size | Notes |
|---|---|---|
| M3.1 Sleep core: manual, start, wake, PATCH, DELETE, restore; active uniqueness; overlap check including the running session (treated as `[start, now)`) | M | Uses the shared timer helpers. Shared lifecycle suite now runs for both kinds |
| M3.2 Sleep UI: Today status (asleep timer / time since last wake), Start sleep / Wake up (≤ 2 taps), manual entry, nap/night label | M | |
| M3.3 Supplements: definitions CRUD (Vitamin D seeded); logs with `local_date`; duplicate-day 409 → "Record another dose anyway?" → `confirmedDuplicate`; "Vitamin D logged at 9:10 by Emily" on Today | M | AC 6: two-phone E2E with two browser contexts; assert the other context shows the log within 2 s |
| M3.4 Universal edit/delete UI for every record type, with confirmation and version checks; move-whole-feed with offset preview | M | |
| M3.5 Recently deleted (Settings): list, restore with D10 | S | AC 19 |
| M3.6 `GET /api/days/:date`, `/weeks/:isoWeek`, `/months/:month`: summaries + records, using the domain aggregations | M | Property tests: the sum of daily allocations equals the total duration for random intervals across DST days |
| M3.7 Calendar Day view: hourly grid, duration blocks, point markers, growth strip, current-time line, lane layout (half-open, stable sort by start/end/id), cross-midnight fragments, marker clustering with an accessible list, tap-empty-slot to create | L | Layout is a pure function (`domain/calendar/layout.ts`), tested separately from rendering. AC 22, 23 |
| M3.8 Calendar Week view: 7 columns, sticky headers, horizontal scroll, minimum column width; filters, period navigation, date picker | M | |
| M3.9 History list view (accessible equivalent) with the same actions | S | |
| M3.10 Trends: Day/Week/Month charts (TanStack Charts, which M4.5 adds; decided 10 Oct 2026), separate minutes and mL scales, numeric summaries next to each chart, "No entries" vs zero, partial-period labelling, averages with their denominator | M | |
| M3.11 Export: `/api/export.json` (schema version, raw rows, audit) and `/api/export.csv` (events + growth tables) | S | |

### M4 — Growth and percentiles

Covers AC 8, 9, 18 (growth part).

| Task | Size | Notes |
|---|---|---|
| M4.1 **Percentile gate:** bundle the WHO girls' expanded daily LMS tables (weight-for-age, length-for-age, head-circumference-for-age, 0–730 days) with `MANIFEST.json` (URLs, dataset ids, sha256 checked in CI) | S | WHO's six workbooks for girls (z-scores and percentiles for each indicator) are bundled as JSON in `packages/domain/data/who`, one array per column, with `lms-girls.json`, the L, M and S per day that runtime code reads. `pnpm who:tables` rebuilds them from WHO. A scripts test checks every sha256 in `MANIFEST.json`, and that the runtime table matches the z-score tables (decided 10 Oct 2026) |
| M4.2 LMS engine + validation: for every day 0–730 and each metric, the WHO published P3/P15/P50/P85/P97 values must map back to 3/15/50/85/97 within ±0.5 percentile points. Compare z-scores with WHO's expanded z-score tables, including the >3 SD restricted adjustment | M | Percentile display stays off until this suite passes. The tolerance goes into `docs/percentiles.md`. The suite is `who-gate.test.ts`. It also maps WHO's SD4neg to SD4 back within ±0.002 in z, which fails a table read one day out of step. Age is chronological: whole days to the measurement's local date (decided 10 Oct 2026) |
| M4.3 Growth core: POST/PATCH/DELETE/restore; at least one metric; clearing one metric keeps the others; clearing the last → confirm delete | S | A measurement is its time and any of weight (g), length and head circumference (cm), at least one, and any number a day (decided 10 Oct 2026). Values keep full precision, within 200 g to 40 kg, 20 to 150 cm and 15 to 70 cm. An edit sends every field: `null` clears a metric, and an edit that would clear the last is refused, so the form offers to delete instead. `GET /api/growth` lists live measurements, newest first, without percentiles: the phone works those out (M4.4). A birth date can't move after a live measurement |
| M4.4 Growth UI: entry with lb+oz / kg / g and cm / in; measurement cards per the reference layout (date header, three columns, icon, value, whole-number percentile or "Percentile unavailable", chevron to edit); per-metric latest | M | |
| M4.5 Growth charts: measured points over the 3/15/50/85/97 curves, labelled "WHO Child Growth Standards", no colour judgement, numeric table equivalent | M | One Growth page: a Weight / Length / Head switch over one chart drawn with TanStack Charts (`@tanstack/charts`, pinned), and "Show as a table" under it, newest first (decided 10 Oct 2026). The curves come from `valueAtPercentile`, within WHO's printed rounding on every day (`docs/percentiles.md`). The age axis steps from birth–6 months to 1 and 2 years as she grows. Weight's axis reads kg for kg or g households and lb for lb & oz, and the table and a tapped point's details use the household's unit. Only her points take focus or a tooltip. Growth ships in the main bundle, about 56 kB gzip more; M5.5 decides on splitting |

### M5 — Polish and hardening

Covers AC 15 (restore drill), plus the accessibility pass.

| Task | Size | Notes |
|---|---|---|
| M5.1 Install prompt and iOS "Add to Home Screen" guidance | S | |
| M5.2 Accessibility: focus order, keyboard operation of the calendar, labels, contrast in both themes, VoiceOver pass on iPhone | M | Run axe in Playwright on every screen |
| M5.3 Restore drill in a separate environment: write data, take a bookmark, mutate, restore, verify; write `docs/runbooks/restore.md` | S | AC 15. M1.16 builds `pnpm admin pitr:bookmark` and `pitr:restore`, and runs a first drill on the still-empty production household |
| M5.4 "No connection" refinements: last-updated timestamp, disabled-control reasons, retry affordances | S | On a slow network, the installed app opens its saved copy after about 3 s instead of waiting (decided 10 Oct 2026). No connection says when the app last heard from the household, for this session only: a cold start offline still says Today couldn't be loaded (decided 10 Oct 2026). Every failed load offers Try again. Today refreshes at the household's midnight (decided 10 Oct 2026). The quick actions say why they wait, and Settings shows whether the phone's offline copy is this version (decided 10 Oct 2026) |
| M5.5 Bundle and performance check: month summary latency with two years of synthetic data | S | If slow, add per-period caching in the DO (§9) |

---

## 5. Key server flows (reference for M1.7 / M3.1)

**Switch side** — `POST /api/feeds/:id/switch {actionId, version, occurredAt}`, where `occurredAt` is the tap time

1. Look up the receipt; if present, return the stored response.
2. In the transaction: load the feed. If `version` ≠ the current version → 409 `STALE_VERSION` with the feed as it is now, deleted or not. A deleted or completed feed with the current version → 404.
3. Find the open segment (none if paused → 404, since the version was current: M1.6's order of refusals). Check `occurredAt` > segment start and ≤ now + 5 min.
4. Run the D9 overlap check on the new segment, which counts as reaching 5 minutes past now. Close the open segment at `occurredAt` and insert one for the other side there. Recompute session bounds. Increment `version`.
5. Store the receipt. Respond with the feed and `changed`. Broadcast.

Two simultaneous switches: the DO runs them one after the other. The second carries the old version and gets 409 (AC 13).

**Start sleep while one is active** → 409 `SLEEP_ALREADY_ACTIVE` with the session → the UI offers "Wake at …" (with stop-time correction) or Cancel.

**Edit segment time across midnight** → validate ordering and overlap, recompute feed bounds, then `changed` = today, last24h and `affectedPeriods` of the feed's session before and after the edit, which covers both segment intervals. AC 7 and 18 check both days.

---

## 6. Testing strategy

| Layer | Tooling | What it proves |
|---|---|---|
| Domain | Vitest, fast-check property tests | Aggregation, splitting, DST, units round-trip (AC 8), percentiles (AC 9), calendar layout |
| DO core | `@cloudflare/vitest-plugin` with a real DO SQLite and a pinned clock | Invariants, 409s, idempotency (AC 14) including a retry after commit but before broadcast that rebroadcasts the stored keys, and a same-`actionId` retry with edited values that returns `ACTION_REPLAY_MISMATCH`, concurrency by running requests in parallel against one stub (AC 13), soft delete and restore (AC 19), clock-skew tolerance (AC 21), timezone change (D8) |
| Worker | Same pool | 401 without identity, header stripping, unknown email gets no data, disabled caregiver blocked and socket closed (AC 1, 10) |
| E2E | Playwright, iPhone viewport, WebKit + Chromium, `vite preview` with `access.dev` | Tap budgets (AC 2), two contexts for live updates (AC 6, 16), offline and auth-expiry flows using `context.setOffline` (refusing the household's socket too, since WebKit's `setOffline` still lets a new socket connect, and with service workers blocked except in `offline.spec.ts`; M1.14) and a `vite preview` middleware that, while a test cookie is set, answers `/api/*` with a 302 to a foreign origin as Access does for an expired session (AC 10, 11; M1.10, since WebKit can't fulfil a redirect through `page.route`). The auth-expiry case starts with a half-filled form, expires the session, follows Sign in → `/api/login` → back to the same route, and checks that the draft is restored and saved exactly once with the same `actionId`. A second case checks that a draft older than 12 h asks for confirmation instead of auto-saving, timer lifecycle (AC 20) using page reload and clock control |
| Device checklist | Manual, on both iPhones, per release | S1/S2 re-run, lock-screen timer survival, airplane mode, VoiceOver spot check (AC 25) |

Spec scenarios that become named fixtures: the 15+15 min / 50+50 mL feed (AC 4), 40+20 mL bottle (AC 3), 23:30–01:00 sleep (AC 12), 50 → 70 mL edit and month move (AC 17), 23- and 25-hour days (AC 23).

---

## 7. Acceptance criteria → milestone

| AC | Milestone | Primary test |
|---|---|---|
| 1, 10, 25 | M1 (+ S1–S3) | Worker tests, device checklist |
| 2 | M1 (feed/diaper), M3 (sleep/supplement) | Tap-count E2E |
| 3, 4, 5, 13, 14 | M1 | Domain + DO tests |
| 6 | M3 | Two-context E2E |
| 7, 16, 17, 18, 19, 22, 23 | M3 (growth parts of 18 in M4) | Domain + DO + E2E |
| 8, 9 | M4 | Domain tests vs WHO tables |
| 11 | M1 | Offline E2E |
| 12, 20, 21 | M1 (nursing), M3 (sleep) | Shared lifecycle suite |
| 15 | M3 (export), M5 (restore drill) | Runbook |
| 24 | Out of scope: M2 dropped (10 Oct 2026) | — |

---

## 8. Risks and open items

| Item | Impact | Mitigation / owner |
|---|---|---|
| iOS standalone PWA cookie jar vs the Access/Google bounce (S1) | Could invalidate the auth design | **Resolved in Step 0.** Google sign-in works inside the installed PWA on both iPhones, and both recovered from a forced logout. Andrew's also survived a reopen more than an hour later; Emily's one-hour reopen was waived and is covered by the per-release device checklist. OTP fallback not needed |
| Effect 4 and `@effect/sql-sqlite-do` are days old | API churn, bundle size | Pin exact versions. D2 keeps Effect out of the transactional core, so swapping the HTTP layer is cheap |
| Access on WebSocket upgrades from the installed PWA (S2) | Live updates | **Resolved in Step 0.** Works from desktop Chrome and the installed iPhone PWA with the hostname app and JWT verification. No ticket needed |
| Static Assets and Access interaction (S4) | Assets get no `ctx.access`; the shell and `/sw.js` require sign-in | D5 verifies the JWT. The service worker installs and updates only while signed in. The installed app's cached shell opens offline (S4 pass) |
| Import source unknown | M2 blocked | **Resolved:** M2 dropped (10 Oct 2026). The household starts fresh |
| WHO extreme-value handling and dataset choice | Wrong percentiles | M4.2 gate, which passes (`docs/percentiles.md`). CI runs it on every pull request |
| Two-person, single-environment ops | A bad migration hits live data | Migrations are forward-only and tested against an export of production data in a preview DO before deploy, once M3.11's export exists. `pnpm release` takes a PITR bookmark before every deploy and logs it, and `pnpm admin pitr:restore` rewinds to it (M1.16) |

**Questions for Andrew and Emily before M1:**

1. Which app holds the existing records, and can you send a sample export? No import: M2 is dropped (Andrew, 10 Oct 2026).
2. Household timezone and display units (mL or oz, kg or lb+oz) to use as defaults. Units are a household setting in Settings, starting at mL, kg and cm (M1.15).
3. Are you OK with D6 (disabling a caregiver is a command, not a screen)? Yes, with `caregiver:enable` to undo it (Andrew, 9 Oct 2026).

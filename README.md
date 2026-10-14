# Baby tracker

A two-caregiver baby tracker on Cloudflare Workers. The plan is `docs/implementation-plan.md`; Step 0 results are in `docs/spike-results.md`.

## Setup

Node 24, at the exact version in `.nvmrc` (`nvm install && nvm use`; CI reads the same file), and pnpm 10 (`corepack enable`), then `pnpm install`. Node runs the `.ts` scripts directly.

Locally, `pnpm dev` and `pnpm e2e` run the `local` environment in `apps/worker/wrangler.jsonc` (`CLOUDFLARE_ENV=local`). It signs every request in as the `access.dev` identity, so `/api/*` requests get past the Access check (D5), and the household seeds a made-up household for that identity when it starts. In `vite preview`, the cookie `bt-preview-signed-out=1` makes every `/api/*` request answer like an expired Access session, and `/api/login` clears it. The E2E tests sign out that way.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Vite dev server with the Worker running in workerd |
| `pnpm lint` / `pnpm format` | oxlint, then an oxfmt check / oxfmt write. Only the root configs apply, to every package: nested configs are ignored, so per-folder rules go in `overrides`. Lint findings are never auto-fixed |
| `pnpm pins:check` | Fails unless every catalog version is exact and packages use `catalog:` or `workspace:*` |
| `pnpm typecheck` | `tsc` for the root and every package |
| `pnpm test` | Vitest: domain tests under two host time zones (east and west of UTC), contract tests, Workers tests in workerd, web client tests, and script tests |
| `pnpm coverage` | Domain tests with the 100 % coverage gate on statements, branches, functions and lines |
| `pnpm build` | Client and Worker build into `apps/web/dist` |
| `pnpm bundle:check` | Fails if the Worker is over 400 KiB gzip, or the app's main script over 350 kB gzip or its CSS over 15 kB (run `pnpm build` first). It gzips the app's files with `node:zlib`, which reads about 1 % under Vite's build report |
| `pnpm bench` | Times each read, a feed write and a sleep write over two years of heavy logging (12 feeds a day, each with two sides and a bottle, 10 diapers a day and 6 sleeps a day) in a test household in workerd, and prints a table. CI never runs it: run it when a period read or a migration changes |
| `pnpm migrations:dry-run <file>` | Applies the migrations an export hasn't seen to a copy of it in memory, in Node's SQLite rather than workerd's. It rebuilds the tables the export was taken under, checks the export's tables, and the columns of each table with rows, against them, loads every row, then runs each new migration in its own transaction with foreign keys on, as the Durable Object does. It fails if a migration fails, a table's row count changes (a migration that adds rows to a table the export holds fails too) or a reference breaks, and it refuses an export with no rows or with nothing to apply. An export holds no `receipts` rows, so a migration that touches `receipts` meets none. It writes nothing and needs no token. Run it on a fresh `pnpm admin export` before merging a migration |
| `pnpm e2e` | Playwright, WebKit and Chromium at iPhone size (`pnpm exec playwright install chromium webkit` once) |
| `pnpm api:docs` | Rewrites `docs/api.json` from the API in `packages/contracts`. A test fails while it's stale |
| `pnpm who:tables` | Downloads WHO's six growth workbooks for girls, checks them, and rewrites `packages/domain/data/who` and its `MANIFEST.json`. Needs the network and `unzip`; CI never runs it. A test fails if a bundled file no longer matches its sha256 |
| `pnpm admin household:seed …` | Seeds the deployed household, once, through `/api/admin/household`. Reads `BT_URL`, `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (the admin service token) from `.admin-token.env`, which git ignores. `pnpm admin` prints the flags |
| `pnpm admin caregiver:disable` / `caregiver:enable` / `caregiver:set-email` | Turns a caregiver off or on, or moves them to a new email, keeping their entries (D6). Update the Access policy to match: `docs/runbooks/access.md` |
| `pnpm admin pitr:bookmark` / `pitr:restore` | Names the household's current point in time, or rewinds it to a bookmark or `--at` a time in the last 30 days, then restarts it. A restore answers with the bookmark that undoes it |
| `pnpm release` | Deploys `origin/main`'s head to https://baby.andamonium.dev. CI's `deploy.yml` runs it after every green push to `main` (M5.7), so run it by hand only when that deploy failed or deploys are paused. It refuses unless the checkout is clean at `origin/main` with green CI, builds without `CLOUDFLARE_ENV`, and checks the built config. Then it uploads the build as a version tagged with the commit, and puts that version live with the restore point in the deployment's message. `docs/runbooks/access.md` has the rest |

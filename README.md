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
| `pnpm bundle:check` | Fails if the Worker is over 400 KiB gzip (run `pnpm build` first) |
| `pnpm e2e` | Playwright, WebKit and Chromium at iPhone size (`pnpm exec playwright install chromium webkit` once) |
| `pnpm api:docs` | Rewrites `docs/api.json` from the API in `packages/contracts`. A test fails while it's stale |
| `pnpm who:tables` | Downloads WHO's six growth workbooks for girls, checks them, and rewrites `packages/domain/data/who` and its `MANIFEST.json`. Needs the network and `unzip`; CI never runs it. A test fails if a bundled file no longer matches its sha256 |
| `pnpm admin household:seed …` | Seeds the deployed household, once, through `/api/admin/household`. Reads `BT_URL`, `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (the admin service token) from `.admin-token.env`, which git ignores. `pnpm admin` prints the flags |
| `pnpm admin caregiver:disable` / `caregiver:enable` / `caregiver:set-email` | Turns a caregiver off or on, or moves them to a new email, keeping their entries (D6). Update the Access policy to match: `docs/runbooks/access.md` |
| `pnpm admin pitr:bookmark` / `pitr:restore` | Names the household's current point in time, or rewinds it to a bookmark or `--at` a time in the last 30 days, then restarts it. A restore answers with the bookmark that undoes it |
| `pnpm release` | Deploys `main` to https://baby.andamonium.dev: refuses unless the checkout is a clean `main` matching `origin/main` with green CI, builds without `CLOUDFLARE_ENV`, checks the built config, takes a bookmark, deploys, and logs it to `deploys.log`. The first deploy is `pnpm release --first`, with no household to bookmark yet |

# Baby tracker

A two-caregiver baby tracker on Cloudflare Workers. The plan is `docs/implementation-plan.md`; Step 0 results are in `docs/spike-results.md`.

## Setup

Node 24, at the exact version in `.nvmrc` (`nvm install && nvm use`; CI reads the same file), and pnpm 10 (`corepack enable`), then `pnpm install`. Node runs the `.ts` scripts directly.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Vite dev server with the Worker running in workerd |
| `pnpm lint` / `pnpm format` | oxlint, then an oxfmt check / oxfmt write. Only the root configs apply, to every package: nested configs are ignored, so per-folder rules go in `overrides`. Lint findings are never auto-fixed |
| `pnpm pins:check` | Fails unless every catalog version is exact and packages use `catalog:` or `workspace:*` |
| `pnpm typecheck` | `tsc` for the root and every package |
| `pnpm test` | Vitest: domain tests under two host time zones (east and west of UTC), Workers tests in workerd, and script tests |
| `pnpm coverage` | Domain tests with the 100 % coverage gate on statements, branches, functions and lines |
| `pnpm build` | Client and Worker build into `apps/web/dist` |
| `pnpm bundle:check` | Fails if the Worker is over 400 KiB gzip (run `pnpm build` first) |
| `pnpm e2e` | Playwright, WebKit and Chromium at iPhone size (`pnpm exec playwright install chromium webkit` once) |

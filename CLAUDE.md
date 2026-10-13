# huckleberry-clone

A baby tracker for one household: a Cloudflare Worker with a Durable Object behind Access, and a web app installed on two iPhones. `docs/implementation-plan.md` is the plan (spec v0.10), each task's own plan is in `docs/superpowers/plans/`, and `docs/runbooks/` covers production.

## Tracking work

Work is tracked in GitHub issues. The Baby Tracker Roadmap artifact was frozen on 13 Oct 2026: don't publish to it, and don't add to `roadmap-pending.md`.

- **Tasks** are issues titled with their plan ID (`M3.1 …`), in the milestones `M3 Sleep and history` and `M5 Polish and hardening`.
- **Taking a task:** add the `in progress` label, and comment with your session's name and whether it's built natively or by subagents. Every session acts as ItsAndrewM on GitHub, so assignees can't tell sessions apart.
- **While you work:** post grill decisions, plan approval and progress as comments on the task's issue, and tick its hand-off notes as your plan covers them.
- **Hand-offs** for a later task go in a comment on that task's issue. If it has no issue, open one.
- **Branches** end with the plan ID (`feature/<title>.M3.1`), or `GH-<number>` for an issue without one. A PR's description says `Closes #<number>`, so the merge closes the issue.
- **Andrew's to-dos** (checks on the phones, decisions) are issues labelled `andrew` and assigned to him.
- **Bugs and debt** found along the way get an issue of their own, labelled `bug`, `enhancement` or `tech debt`.
- **The household's real values** (names, emails, the child's details, the household's name and time zone) never go in issues, PRs, commits or the repo.

## Cross-cutting rules

- **Releases.** A merge to `main` deploys once CI passes on that commit (`deploy.yml`), with its restore point, the UTC second before, in the deployment's message; `pnpm admin pitr:restore --at` rewinds the household to it. A commit that `main` has moved past is skipped, and `gh workflow disable deploy.yml` pauses deploys. `pnpm release` in the main checkout is the fallback, on Andrew's word only. A Durable Object class change can't deploy through CI (`docs/runbooks/access.md`, Deploys). Say in a PR's description that merging deploys it. After each deploy, Andrew opens the app online once on each phone, so its offline copy updates.
- **Migrations** are forward-only. Try each one on a fresh `pnpm admin export` before it merges: rebuild the tables from the export's `migrations`, insert its rows with foreign keys off, then apply the new migration. Run `pnpm bench` after any change to a period read or a migration.
- **Receipts after a deploy.** `Diaper`, `Feed` and `Measurement` are stored responses. A field that's added, removed or renamed, or a tightened check, must stay decodable for 24 hours, or a retry within that day answers 500. `apps/worker/test/feeds.test.ts`'s "decode the response and changed keys stored before a deploy…" fails when that happens.
- **Installed apps after a deploy.** An app older than the Worker reads `ChangedMessage`: add fields to it, but never rename or remove one.
- **Lazy chunks.** If routes are ever split into lazy chunks, reload on a failed chunk import first.
- **25-hour days in tests.** tzdata 2026c keeps America/Vancouver on UTC−7 after 1 Nov 2026, so it has no 25-hour day that year; use America/Los_Angeles.
- **Service workers in E2E.** `playwright.config.ts` blocks them, so `page.route` sees every request; only `offline.spec.ts` allows them. Playwright's block resolves `register` rather than refusing it, so no E2E test sees a refused registration.
- **Offline in WebKit tests.** `setOffline` closes open sockets but still lets a new one connect, and the app counts an open socket as online. An offline test that asserts "No connection" should also refuse `/api/ws`, as `goOfflineLikeAPhone` does.
- **Local E2E state.** Settings changes made in `pnpm dev` land in `apps/web/.wrangler/state`, which `pnpm e2e` shares, so a renamed child or changed units fails specs such as `shell.spec.ts`'s `/api/me` check. Delete that folder to start over; CI always starts empty.

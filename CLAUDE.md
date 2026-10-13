# huckleberry-clone

A baby tracker for one household: a Cloudflare Worker with a Durable Object behind Access, and a web app installed on two iPhones. `docs/implementation-plan.md` is the plan (spec v0.10), each task's own plan is in `docs/superpowers/plans/`, and `docs/runbooks/` covers production.

## Tracking work

Work is tracked in GitHub issues. The Baby Tracker Roadmap artifact was frozen on 13 Oct 2026: don't publish to it, and don't add to its log (`roadmap-pending.md`, under `~/.claude/projects/`, not in the repo).

- **Tasks:** each is an issue titled with its plan ID (`M3.1 …`), in the milestone `M3 Sleep and history` or `M5 Polish and hardening`.
- **Taking a task:** add the `in progress` label, and comment with your session's name and whether it's built natively or by subagents. Every session acts as ItsAndrewM on GitHub, so assignees can't tell sessions apart.
- **While you work:** post grill decisions, plan approval and progress as comments on the task's issue, and tick its hand-off notes as your plan covers them.
- **Hand-offs:** a note for a later task goes in a comment on that task's issue. If it has no issue, open one.
- **Branches and PRs:** a branch ends with the plan ID (`feature/<title>.M3.1`), or `GH-<number>` for an issue without one. A PR's description says `Closes #<number>`, so the merge closes the issue.
- **Andrew's to-dos:** checks on the phones and decisions are issues labelled `andrew` and assigned to him.
- **Bugs and debt:** anything found along the way gets an issue of its own, labelled `bug`, `enhancement` or `tech debt`.
- **Household values:** the child's name and birth date, the parents' emails, and the household's name and time zone never go in issues, PRs, commits or the repo.

## Cross-cutting rules

- **Releases:** a merge to `main` deploys once CI passes on it (`deploy.yml`), so say in a PR's description that merging deploys it. `pnpm release` in the main checkout is the fallback, on Andrew's word only, and a Durable Object class change can only deploy by hand. Deploys, pausing them and recovering from a bad one are in `docs/runbooks/access.md`. After each deploy, Andrew opens the app online once on each phone, so its offline copy updates.
- **Migrations:** they're forward-only. Before one merges, try it on a fresh `pnpm admin export` (rebuild the tables from the export's `migrations`, insert its rows with foreign keys off, then apply the new migration), run the restore drill in `docs/runbooks/restore.md`, and run `pnpm bench`. Run `pnpm bench` after any change to a period read, too.
- **Receipts after a deploy:** every endpoint built on `mutations` (`apps/worker/src/mutations.ts`) stores its response as a receipt, which a retry within a day replays: today `Diaper`, `Feed`, `Measurement`, `Household` and `Child`. A field that's added, removed or renamed, or a tightened check, must stay decodable for 24 hours, or that retry answers 500. Only `Feed` has a test for it: `apps/worker/test/feeds.test.ts`'s "decode the response and changed keys stored before a deploy…".
- **Installed apps after a deploy:** an app older than the Worker reads `ChangedMessage`, so add fields to it, but never rename or remove one.
- **25-hour days in tests:** tzdata 2026c keeps America/Vancouver on UTC−7 after 1 Nov 2026, so it has no 25-hour day that year; use America/Los_Angeles.
- **Service workers in E2E:** `playwright.config.ts` blocks them, so `page.route` sees every request; only `offline.spec.ts` and `sheets-offline.spec.ts` allow them. Playwright's block resolves `register` rather than refusing it, so no E2E test sees a refused registration.
- **Offline in WebKit tests:** `setOffline` closes open sockets but still lets a new one connect, and the app counts an open socket as online. An offline test that asserts "No connection" should also refuse `/api/ws`, as `goOfflineLikeAPhone` does.
- **Local E2E state:** settings changes made in `pnpm dev` land in `apps/web/.wrangler/state`, which `pnpm e2e` shares, so a renamed child or changed units fails specs such as `shell.spec.ts`'s `/api/me` check. Delete that folder to start over; CI always starts empty.

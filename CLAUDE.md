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

- **Releases:** a merge to `main` deploys once CI passes on it (`deploy.yml`), so say in a PR's description that merging deploys it. `pnpm release` in the main checkout is the fallback, on Andrew's word only, and a Durable Object class change can only deploy by hand. While GitHub Actions can't run CI, `pnpm release --gates-local` runs CI's own commands on the Mac instead of asking GitHub (#96). Deploys, pausing them and recovering from a bad one are in `docs/runbooks/access.md`. A phone picks up a deploy by itself (#61): it saves the new build the next time it's online, and opens it the next time the app comes back online with nothing open. Settings › Offline copy says when a newer version is waiting.
- **Migrations:** they're forward-only. Before one merges, run `pnpm migrations:dry-run` on a fresh `pnpm admin export` (it rebuilds the tables from the export's `migrations`, loads its rows, then applies the new migration with foreign keys on, as the Durable Object does), run the restore drill in `docs/runbooks/restore.md`, and run `pnpm bench`. Run `pnpm bench` after any change to a period read, too.
- **Receipts after a deploy:** every endpoint built on `mutations` (`apps/worker/src/mutations.ts`) stores its response as a receipt, which a retry within a day replays: today `Diaper`, `Feed`, `Measurement`, `Sleep`, `Supplement`, `Dose`, `Household` and `Child`. A field that's added, removed or renamed, or a tightened check, must stay decodable for 24 hours, or that retry answers 500. Only `Feed` has a test for it: `apps/worker/test/feeds.test.ts`'s "decode the response and changed keys stored before a deploy…".
- **Installed apps after a deploy:** an app older than the Worker reads `ChangedMessage`, so add fields to it, but never rename or remove one.
- **25-hour days in tests:** tzdata 2026c keeps America/Vancouver on UTC−7 after 1 Nov 2026, so it has no 25-hour day that year; use America/Los_Angeles.
- **Rejections in Worker tests:** call a household method that rejects, or that restarts the object, from inside it with `runInDurableObject`, and handle the outcome outside. Over RPC (`stub.restart()`), workerd prints the rejection as an uncaught exception, even though the test handles it. A full `pnpm test` prints none, so a new one is a real error (#77).
- **Service workers in E2E:** `playwright.config.ts` blocks them, so `page.route` sees every request; only `offline.spec.ts`, `sheets-offline.spec.ts` and `new-version.spec.ts` allow them. `new-version.spec.ts` deploys by cookie: with `bt-preview-next-build=1`, the preview serves the same build stamped `<version>-next` (`apps/web/preview-next-build.ts`). Playwright's block resolves `register` rather than refusing it, so no E2E test sees a refused registration.
- **The live socket in E2E:** specs take `test` from `e2e/test.ts`, as lint enforces, so every page hears a played socket rather than the local household that every spec writes to (#72).
  - It answers the heartbeat, and `socket.changed(…)` sends it the household's `changed` message.
  - `context.setOffline(true)` closes it and refuses new ones until the test is back online. Neither engine's own `setOffline` reaches a played socket, and WebKit's still lets a real one reconnect, which the app reads as online.
  - A spec's own `page.routeWebSocket` takes that page's socket instead, as live.spec's and new-version.spec's do. `socket.changed` and `setOffline`'s closing then leave that socket to the spec.
  - A test that needs the real household's socket says `test.use({ household: "real" })`. A context from `browser.newContext()` hears the real one too.
- **Going offline in E2E:** `context.setOffline(true)` also refuses every answer a test plays through `page.route` in its own context (`route.fulfill` or `route.continue`) until it's back online, so the page sees a dropped request, as a phone would (#60). A spec that goes offline first waits for what its page loads: a control enabled, not just visible. A refused answer leaves that part of the page unloaded until the test is back online, and one that lands just before the offline event can still put the app back online.
- **Playwright's clock in E2E:** once a spec calls `page.clock`, `e2e/test.ts` floors its `Date.now()` to a whole millisecond, as a phone's always is. Inside a timer set with a fractional delay, such as the reconnect's jitter, Playwright's `Date.now()` returns a fraction, and Effect's tracer throws "RangeError: Not an integer" at every request's start (#60).
- **Local E2E state:** settings changes made in `pnpm dev` land in `apps/web/.wrangler/state`, which `pnpm e2e` shares, so a renamed child or changed units fails specs such as `shell.spec.ts`'s `/api/me` check. Delete that folder to start over; CI always starts empty.

# GH-92 and GH-91 Held Failures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, chosen by Andrew on 15 Oct 2026) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two follow-ups from #75's final review, in one PR that closes both:
- **#92:** a failed send that lands in its own sheet, after the parent has opened that sheet again, opens the sheet again on the failure. A second tap can then no longer log a second diaper, or wake her at the later time.
- **#91:** closing a sheet asks before it lets go of a failed control that could still be saved as it is: Wake up, Finish, Pause, Switch, Resume, Nap or night, every edit and every delete. Today it's dropped without a word.

The PR also takes #93's deferred test gaps, and answers CodeRabbit's three outside-diff notes on #93 and #98.

**Architecture:**
- **#92, the reopen** (`apps/web/src/sheets/sheets-state.ts`, Node tests): `failedState` opened a sheet again on its failure in two cases. The first is when the failure found the sheet closed. The second is when the sheet was the one the send was kept open for (`keptOpen`, #75).
  - A failure that landed in its own sheet opened afterwards sat beside a fresh form with a new actionId, which the form had seeded when it mounted.
  - Now any failure of a send that closes its sheet opens it again when it lands on the open sheet's own opening (`landsInItsOwnSheet`: the same sheet, and the same record or supplement for a sheet that opens on one).
  - The content mounts again (`opened` + 1), seeded from the failure, as every form already is on the closed-sheet path. It doesn't hold taps (`queued: false`), as #75's in-place reopen doesn't.
- **#91, the question on close** (`sheets-state.ts`, `held.ts`, Node tests):
  - One rule decides whether a held failure asks before it goes (`asksFirst`):
    - An entry asks unless the household said it can't be saved as it is (already saved, another feed or sleep running), as now.
    - A control asks when it could still be saved as it is (`savesAsItIs`): its note offers Try again (no connection, Not saved) or Sign in.
  - `dismissedState` asks on that rule. `leaving` keeps such a failure through another sheet opened from its own (Add bottle from Nursing), and its sheet opens again when that one closes, as an entry's does.
  - Another control sent from the same sheet still replaces the held one (`goesOnAnotherSend`, the old rule), since a different button acts at its own tap (#75).
- **The question's words** (`apps/web/src/sheets/discard-question.ts`, new, Node tests): `discardQuestion(sending, household)` names what would be lost.
  - The tapped controls give their time on the household's clock: "Discard the wake-up at 2:40 AM?".
  - Edits say "Discard your changes?", deletes "Discard the delete?", restores "Discard the restore?", and entries keep "Discard this entry?".
  - One `satisfies Record<Action["kind"], string>` table holds the words, so a new action kind fails typecheck until it has its own. `DiscardPrompt` shows the sentence.
- **The note** (`failure.ts`, `kept-on.ts`, new): a control's no-connection note asks to keep the app open, the words an entry gets when the phone can't keep it.
  - `keptOnFor(sending, keeping)` picks them, and `KeptOn` loses `null`.
  - M5.4's "a control promises nothing" becomes "a control promises what it now keeps".
- **#93's minors** (`failure.ts`, tests): `failureNote` takes its Try again from `offersRetry` instead of repeating the rule. New tests pin:
  - a held delete sent again
  - one failed nursing control held at a time
  - a paused feed's Finish offline
  - the household's `ACTION_REPLAY_MISMATCH` when a diaper is changed after its first send landed unanswered
- **The specs:**
  - `e2e/held-failures.spec.ts` is new.
  - `e2e/first-tap.spec.ts` gains the offline Finish.
  - Three specs that pinned the old rules change, as Andrew decided: `failed-control.spec.ts`, `discard-entry.spec.ts` and `edit-diaper.spec.ts`.

**Tech Stack:** React 19, TanStack Query 5, Effect, TypeScript 5.9.3, Vitest 4.1.11, Playwright 1.64.0, oxlint 1.87.0 and oxfmt 0.72.0, Node 24.21.0. No package is added.

**Spec:** issues #92 and #91: their bodies, the comments "Taken by session b5", "Andrew's call", "More of Andrew's calls" and "The rest of the grill". Also:
- `docs/implementation-plan.md`, the M1.12 row (the sheets, #75's decision), M5.4 (what a failed save promises) and M5.6 (held entries)
- #75's plan, `docs/superpowers/plans/2026-10-14-gh-75-first-tap.md`: `failedState`'s in-place reopen, `retapped` and `offersRetry`
- #93's final review minors, in its plan's "Post-review notes", and CodeRabbit's notes from outside #93's and #98's diffs

Andrew decided these on 15 Oct 2026, in the grill before this plan:
- **Execution:** native, one plan and one PR.
- **#92:** a failed entry that lands in its own sheet after the parent opened it again reopens the sheet on it. The form shows the first tap's time and values, and its buttons save that entry under its actionId. Anything typed in those seconds is replaced.
- **#91:**
  - **On close, ask first, as entries do.** The rule covers a failure that could still be saved as it is: no connection, Not saved, or an expired sign-in. Keep leaves the sheet open on it. It lives only while the app is open, not across a reload.
  - **Which controls:** every one, with one rule: Wake up, Finish, Pause, Switch, Resume, Nap or night, every edit and every delete.
  - **The words** name what would be lost, with its time: "Discard the wake-up at 2:40 AM?", "Discard the pause at 2:40 AM?", "Discard the finish at 2:40 AM?". Edits say "Discard your changes?" and deletes "Discard the delete?".
  - **The note:** a control's no-connection note asks to keep the app open.
- **#93's minors:** the test gaps only. "Version on resend" stays as it is.
- **CodeRabbit's notes:**
  - #93's two notes (renew the actionId when a resent payload changes) are declined, with a test that pins the household's answer.
  - #98's note becomes a runbook line.

## Global Constraints

- **Where to work:** the worktree `.claude/worktrees/gh-92-held-failures`, on `fix/a-failed-send-sits-beside-a-fresh-form-and-can-log-twice-and-a-failed-wake-finish-or-nursing-button-is-dropped-when-its-sheet-closes.GH-92`, cut from `main` at `5926ce3` (#98). Never the main checkout.
- **Tracking:** issues #92 and #91. Post plan approval and progress on #92, and the #91 decisions on #91. Hand-offs go on their issues: M5.2 #47, and #71. The PR's description says `Closes #92` and `Closes #91`.
- **Peers building beside this:**
  - d5 builds M5.2 (#47) by subagents. Its replay changes `failure-note.tsx`, `failure.ts`, `sheet.tsx`, `sheets-context.ts`, `sheets-provider.tsx` and `diaper-edit.test.ts` in other hunks.
    - It puts focus on a failure note when the note mounts, so this branch's reopen gets that for nothing. Don't add focus code.
    - It adds `focusOnClose` to `Sheets`, and whoever merges second adds it to any `Sheets` literal.
    - In `failure-note.tsx`, this branch's `keptOnFor` line sits next to M5.2's `about` change.
    - M5.2 is likely to merge second and take this branch in.
  - 41 builds #60 (`e2e/test.ts`, `live.spec.ts`, `connectivity.spec.ts`, `deleted.spec.ts`, `nursing.spec.ts`). None of those is changed here.
- **CI:** GitHub Actions has no minutes until about 1 Nov 2026, so CI won't run on the PR. Run ci.yml's commands here and paste their results in the PR. Merging doesn't deploy: `pnpm release --gates-local` (#96) deploys from the main checkout, on Andrew's word.
- **Running commands:** Node 24.21.0. The steps write `pnpm …`. Run each as `env PATH=/Users/andamonium/.nvm/versions/node/v24.21.0/bin:/Users/andamonium/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm …`, one command at a time. This worktree session refuses compound shell commands, loops, and inline scripts that name git.
- **Taking each task's files:** every file below is in a commit on `scratch/gh-92-replay`, which starts from `5926ce3`, as this branch does: Task 1 `a020a50`, Task 2 `86a27fd`, Task 3 `c66db8f`, Task 4 `d777133`.
  - Take a file with `git checkout <sha> -- <path>`, tests first, and watch them fail before taking the code.
  - `git checkout <sha> -- <path>` also stages the file, so compare with `git diff HEAD -- <path>`.
  - The diffs below are those commits.
- **E2E:** other sessions serve their builds on other ports, so run specs as `pnpm exec playwright test --config .superpowers/e2e.config.ts <spec>`. That config serves this worktree's build on port 4240 and never reuses another server, and git ignores it. CI keeps `playwright.config.ts`.
- **Known flakes:** under the whole suite, WebKit's `live.spec.ts` timing tests (#60), and a browser that closes under load. Rerun a lone failure alone, and compare on `main`, before blaming the branch.
- **Imports:** `apps/web` imports React, TanStack, Base UI, `cn` and its own files. `e2e/` takes `test` and `expect` from `./test.ts`. Relative imports carry their extension.
- **Style:** no semicolons, double quotes, 2-space indent, 120 columns. `pnpm format` writes and `pnpm lint` checks. The code below is already formatted.
- **Lint:**
  - It bans comments of every kind. Put the reason in a name or a test title.
  - No type assertions except `as const`, no non-null `!`, complexity at most 10 per function.
- **React:** logic lives in `.ts` files that run in Node tests, and the views only call it. No effect is added. Before Task 2's view changes (`discard-prompt.tsx`, `failure-note.tsx`), invoke `frontend-ui-expert` and `react-code-standards` (Andrew's standing instruction), to check the work rather than to redesign it.
- **Tests:**
  - `apps/web`'s Vitest project runs in Node.
  - The E2E specs play Today and pin the clock (`NOW` is 9:30 AM on the local household's clock, America/Vancouver), and run the browser in `Europe/London`.
  - A send fails through `loseSaves` (hold, then `internetdisconnected`) or `context.setOffline(true)`.
  - The replay-mismatch test lets its two diaper sends through to the local Worker, so its receipts answer.
  - No real names, emails or birth dates.
- **Figures:** re-measure any number the docs quote before committing, and report any mismatch.
- **Out of scope:**
  - keeping a failed control across a reload (Andrew's call: only while the app is open)
  - a resend's version after the other phone's change (#93's minor, kept as it is)
  - where focus lands (M5.2, #47)
  - splitting `sheets-state.ts` (#71's kind of debt), which grows here
  - the Worker, the contracts, receipts and migrations, which don't change

## Decisions this plan makes (veto in review)

- **P1: The reopen (#92) covers every send that closes its sheet, on its own opening.** That's Diaper, Bottle (a new feed or one added to a running feed), Start nursing, Finish, Start sleep, Wake up, a past feed or sleep, Add measurement, a dose, and the edit sheets' saves and deletes.
  - **Its own opening:** the same sheet, and for a sheet that opens on a record or a supplement (the edit sheets, the dose sheet), the same one.
  - **Not covered:** a nursing button's failure never closes its sheet, so it lands in place as before (#75). Another sheet's failure leaves the open sheet alone.
  - **It doesn't hold taps** (`queued: false`), as #75's in-place reopen doesn't.
  - **An old test is reversed:** `sheet-openings.test.ts`'s "isn't counted when a failure lands in its own open sheet, which keeps the form" (`c184752`, 11 Oct) pinned the old rule, and now says the opposite.
- **P2: The measurement sheet reopens only on the record it opened with** (`addsOrEdits`, `onTheRecordItOpenedWith`). It adds and edits under one opening, so an edit that fails just after Add opened would otherwise replace the typed weight with that edit.
  - M4.4 decided against that (`968ced6`, "Keep the sheet on the record it opened with"), and `measurement.spec.ts`'s two "keeps Add, with its typed weight…" tests pin it.
  - The prototype's whole E2E run caught this. No second entry is possible there, since the failure is about another record.
- **P3: "Could still be saved as it is"** (`savesAsItIs`) means:
  - the note offers Try again (no connection, an unavailable household, an answer it can't read, Not saved), or
  - the note offers Sign in (an expired or refused sign-in).
  A conflict, a refused value or a record that's gone closes as now: the note already says why, and nothing would save. Entries keep their rule.
- **P4: Only closing asks.** Another control sent from the same sheet still replaces the held failure with no question (`goesOnAnotherSend`, the old rule), since #75 made a different button act at its own tap. So Switch after a failed Pause sends the switch, and the pause goes.
- **P5: A failed control waits through a sheet opened from its own.** Nursing's Add bottle dropped a failed Pause without a word (`leaving`).
  - Now the failure stays held, and Nursing opens again on it when the bottle sheet closes.
  - That reopen holds taps for 500 ms, as an entry's sheet does.
- **P6: The words** (`discard-question.ts`), with the time each control was tapped, on the household's clock:

  | Failed control | The question |
  |---|---|
  | Wake up | Discard the wake-up at 2:40 AM? |
  | Pause | Discard the pause at 2:40 AM? |
  | Switch | Discard the switch at 2:40 AM? |
  | Resume | Discard resuming on Right at 2:40 AM? |
  | Finish, running or paused | Discard the finish at 2:40 AM? |
  | Any edit, Nap or night and a start time included | Discard your changes? |
  | Any delete, a bottle's included | Discard the delete? |
  | A restore from Recently deleted | Discard the restore? |
  | Any entry | Discard this entry? |

  - Resume names its side, as the paused view's "Resume on" buttons do.
  - Nap or night is an edit (`editSleep`), so it takes Andrew's words for edits.
  - Before the household has loaded, the time is left out ("Discard the wake-up?").
- **P7: The note.** A control with no connection says "No connection. Keep the app open, and try again once you're back online."
  - `keptOnFor` picks it, and `KeptOn` loses `null`.
  - "No connection. Try again once you're back online." goes.
- **P8: Specs that pinned the old rules change**, as Andrew decided:
  - `failed-control.spec.ts` (M5.4's "promises nothing kept…") expects the keep-the-app-open note.
  - `discard-entry.spec.ts`'s sign-in-draft test closes the sheet, is asked, and taps Discard. The draft still goes once the control leaves the held list.
  - `edit-diaper.spec.ts`'s "puts the diaper back…" sees the new note, is asked "Discard your changes?", and taps Discard.
  - `edit-sheets.test.ts`'s "lets its own record's failure go as it closes, and then opens the other record's" (M3.4) asks first, and opens the other record's sheet after Discard.
- **P9: `failureNote` takes Try again from `offersRetry`.** The note builders no longer set it.
  - `failureNote` adds it when the note has no button of its own and `offersRetry` says the error could go again.
  - The restored notes keep "Save now".
  - `failure.test.ts`'s tie test still checks the two agree for every kind of error. `failure.ts` imports `held.ts`, which imports nothing that leads back to it.
- **P10: #93's CodeRabbit notes, declined.** A resend with changed values keeps the first tap's actionId.
  - If the first send landed unanswered, the household answers `ACTION_REPLAY_MISMATCH` ("This was already saved as you first entered it.", the plan's AC 14).
  - A new actionId would save a second diaper.
  - A resume carries the feed's version, so a new actionId would get "Andrew changed this feed a moment ago." about the parent's own tap.
  - `held-failures.spec.ts` pins the diaper against the local Worker's receipts, and `retap.test.ts`'s resume row pins Resume's actionId.
- **P11: The spec** is a new `e2e/held-failures.spec.ts`, so it doesn't collide with 41's #60 specs.
- **P12: Size.** +0.43 kB gzip of script, 337.23 to 337.66 of 350 kB by `bundle:check`, against `main` at `5926ce3`. The CSS (12.04 kB) and the Worker (262.84 KiB gzip) are unchanged. M5.2's replay adds about 1.38 kB on its own.
- **P13: The docs.** The plan's M1.12, M5.4 and M5.6 rows each gain a "Decided 15 Oct 2026" sentence. The runbook's local-gates section gains the browsers line, from #98's note.

## Review Focus

The six ways this is most likely to fail a parent, each with the test that pins it:

1. **A second diaper, or a late wake, from one tap.** A failure that lands in a sheet opened again must take the form over.
   - Pinned by Task 1's six "opens its own sheet again…" rows and sheet-openings' "is counted…".
   - Also by `held-failures.spec.ts`'s diaper and wake, both of which fail on `main` in both engines.
2. **A failed control lost without a word, by closing, or by Add bottle.**
   - Pinned by Task 2's "asks before letting it go…" (7 controls), "asks for one that waits on a sign-in…" and "keeps it while a sheet opened from its own is open…".
   - Also by `held-failures.spec.ts`'s wake (Keep, then Try again saves the first tap's time) and pause (Discard sends nothing).
3. **A question about something that can't be saved.**
   - Pinned by "lets one go without asking when it can't be saved as it is".
   - `empty-finish.spec.ts` still closes its finish-at-start without asking.
4. **Something stale sent after another button.**
   - Pinned by "lets it go when another control on its sheet is sent" and "holds one failed control on a running feed at a time" (Task 3).
   - A mutant that keeps the held control on another send fails both.
5. **A wrong time, or a wrong word, in the question.** Pinned by `discard-question.test.ts` (the household's clock, Resume's side, no household yet).
6. **Add measurement losing its typed weight to an edit's failure.**
   - Pinned by "leaves Add measurement on the new measurement it opened with…".
   - Also by `measurement.spec.ts`'s two M4.4 tests, which the prototype's whole run caught.

## File map

```
apps/web/src/sheets/
  sheets-state.ts          Tasks 1, 2   landsInItsOwnSheet; asksFirst, goesOnAnotherSend, withoutReplaced
  held.ts                  Task 2       savesAsItIs
  discard-question.ts      Task 2 (new) discardQuestion
  kept-on.ts               Task 2 (new) keptOnFor
  failure.ts               Tasks 2, 3   KeptOn without null; failureNote takes Try again from offersRetry
  failure-note.tsx         Task 2       keptOnFor
  discard-prompt.tsx       Task 2       discardQuestion
apps/web/test/
  sheets-state.test.ts     Tasks 1, 2, 3
  sheet-openings.test.ts   Task 1
  discard-question.test.ts Task 2 (new)
  failure.test.ts, edit-sheets.test.ts, diaper-edit.test.ts   Task 2
  retap.test.ts            Task 3
e2e/
  held-failures.spec.ts    Tasks 1, 2, 3 (new in Task 1)
  failed-control.spec.ts, discard-entry.spec.ts, edit-diaper.spec.ts   Task 2
  first-tap.spec.ts        Task 3
docs/implementation-plan.md, docs/runbooks/access.md   Task 4
```

## Setup

- [ ] **Step 1: Check the branch.** In `.claude/worktrees/gh-92-held-failures`, `git log --oneline -1` shows this plan's commit on `5926ce3`. Run `git fetch origin`; if `main` has moved, merge it (`git merge origin/main`). If Claude Code's classifier refuses, ask Andrew to run it with `! git -C /Users/andamonium/Developer/experimental/huckleberry-clone/.claude/worktrees/gh-92-held-failures merge origin/main`.
- [ ] **Step 2: Install.** `pnpm install --frozen-lockfile --prefer-offline`.
- [ ] **Step 3: Check the E2E config.** `.superpowers/e2e.config.ts` should exist; the planning session left it, and git ignores it. If it's missing, create `.superpowers/.gitignore` holding the single line `*`, then `.superpowers/e2e.config.ts` as a copy of `playwright.config.ts` with `PORT = 4240`, `testDir: "../e2e"`, `retries: 0`, `reporter: "list"`, `trace: "retain-on-failure"` and `reuseExistingServer: false`.
- [ ] **Step 4: Take the baseline.** `pnpm test`. On `5926ce3` this was 3,893 tests in 233 files. The tasks add 34 tests and one file (`discard-question.test.ts`), for 3,927 in 234.

---

### Task 1: A failure that lands in its own sheet, opened again after the send, opens that sheet again on it (#92)

**Files:**
- Modify: `apps/web/src/sheets/sheets-state.ts`, `apps/web/src/sheets/sending.ts`
- Test: modify `apps/web/test/sheets-state.test.ts`, `apps/web/test/sheet-openings.test.ts`; create `e2e/held-failures.spec.ts`

**Interfaces:**
- Consumes: `isOnOpening` and `editingOf` from `held.ts`; `closesOnSend` from `sending.ts`; `opening` and `openingFor` in `sheets-state.ts`.
- Produces: `addsOrEdits(sheet: SheetKind | null): boolean` in `sending.ts`; `failedState`'s wider reopen (`landsInItsOwnSheet`, `onTheRecordItOpenedWith`); `e2e/held-failures.spec.ts` with `openSheet`, `FIRST_TAP`, `OPENED_AGAIN` and `STARTED`, which Tasks 2 and 3 extend.

- [ ] **Step 1: Write the failing tests.** `git checkout a020a50 -- apps/web/test/sheets-state.test.ts apps/web/test/sheet-openings.test.ts e2e/held-failures.spec.ts`. The changes:

`apps/web/test/sheets-state.test.ts`:

```diff
--- a/apps/web/test/sheets-state.test.ts
+++ b/apps/web/test/sheets-state.test.ts
@@ -320,6 +320,42 @@ describe("a failed send", () => {
     expect(failedState(shownState(CLOSED, "bottle"), failed, NOW)).toMatchObject({ open: "bottle", opened: 1 })
   })
 
+  it.each([
+    { label: "a diaper", sending: DIAPER, editing: null },
+    { label: "a wake", sending: WOKE, editing: null },
+    { label: "a dose", sending: DOSE, editing: "supplement-1" },
+    { label: "an edited dose", sending: DOSE_MOVED, editing: "dose-1" },
+    { label: "a new measurement", sending: MEASURED, editing: null },
+    { label: "an edited measurement", sending: MEASUREMENT_EDITED, editing: "measurement-1" },
+  ])(
+    "opens its own sheet again on the reason when the parent opened it after the send, without holding taps: $label",
+    ({ sending, editing }) => {
+      const failed = { sending, error: new Offline() }
+      const sent = sendingState(shownState(CLOSED, sending.sheet, editing), sending, true)
+      const reopened = shownState(sent, sending.sheet, editing)
+      expect(failedState(reopened, failed, NOW)).toMatchObject({
+        open: sending.sheet,
+        opened: 3,
+        queued: false,
+        held: [failed],
+      })
+    },
+  )
+
+  it("leaves its sheet as it is when the parent opened it on another record", () => {
+    const failed = { sending: DOSE_MOVED, error: new Offline() }
+    const sent = sendingState(shownState(CLOSED, "editDose", "dose-1"), DOSE_MOVED, true)
+    const another = shownState(sent, "editDose", "dose-2")
+    expect(failedState(another, failed, NOW)).toMatchObject({ open: "editDose", editing: "dose-2", opened: 2 })
+  })
+
+  it("leaves Add measurement on the new measurement it opened with when an edit sent just before it fails", () => {
+    const failed = { sending: MEASUREMENT_EDITED, error: new Offline() }
+    const sent = sendingState(shownState(CLOSED, "measurement", "measurement-1"), MEASUREMENT_EDITED, true)
+    const adding = shownState(sent, "measurement")
+    expect(failedState(adding, failed, NOW)).toMatchObject({ open: "measurement", editing: null, opened: 2 })
+  })
+
   it("says so in a toast when it was an undo", () => {
     const undo: Sending = {
       sheet: "undo",
```

`apps/web/test/sheet-openings.test.ts`:

```diff
--- a/apps/web/test/sheet-openings.test.ts
+++ b/apps/web/test/sheet-openings.test.ts
@@ -11,9 +11,9 @@ describe("each opening of a sheet", () => {
     expect(afterFailures(DIAPER_HELD).opened).toBe(CLOSED.opened + 1)
   })
 
-  it("isn't counted when a failure lands in its own open sheet, which keeps the form", () => {
+  it("is counted when a failure lands in its own open sheet, so the form starts again from the failure", () => {
     const shown = shownState(CLOSED, "diaper")
-    expect(failedState(shown, DIAPER_HELD, NOW).opened).toBe(shown.opened)
+    expect(failedState(shown, DIAPER_HELD, NOW).opened).toBe(shown.opened + 1)
   })
 
   it("is counted when the sheet opens again for the next held entry of the same kind", () => {
```

`e2e/held-failures.spec.ts` (new):

```ts
import type { Locator, Page } from "@playwright/test"
import {
  caregiversOf,
  gate,
  loseSaves,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningSleep,
  savedDiaper,
  sleepingToday,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "Europe/London" })

const FIRST_TAP = NOW + 37_000
const OPENED_AGAIN = FIRST_TAP + 2 * MINUTE
const STARTED = NOW - 40 * MINUTE

const openSheet = async (page: Page, action: string): Promise<Locator> => {
  await quickAction(page, action).click()
  return page.getByRole("dialog", { name: action })
}

test("a diaper whose send fails after its sheet was opened again saves that first tap, not a second diaper", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const answer = gate()
  const bodies = await loseSaves(page, "**/api/diapers", {
    lost: 1,
    until: answer.opened,
    answer: savedDiaper(andrew.id),
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Diaper")
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet).toBeHidden()
  await page.clock.setFixedTime(OPENED_AGAIN)
  await openSheet(page, "Diaper")
  await expect(sheet.getByRole("button", { name: "Pee" })).toBeVisible()
  answer.open()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]?.actionId).toBe(bodies[0]?.actionId)
  expect(bodies[1]?.occurredAt).toBe(FIRST_TAP)
  await expect(sheet).toBeHidden()
})

test("a wake whose send fails after the Sleep sheet was opened again saves the first tap's time", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const sleep = runningSleep(andrew.id, STARTED)
  await playHousehold(page, sleepingToday(sleep))
  const answer = gate()
  const bodies = await loseSaves(page, "**/api/sleeps/sleep-1/wake", {
    lost: 1,
    until: answer.opened,
    answer: (body) => ({ sleep: { ...sleep, endedAt: body.occurredAt ?? NOW, version: 2 }, changed: [["today"]] }),
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Sleep")
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect(sheet).toBeHidden()
  await page.clock.setFixedTime(OPENED_AGAIN)
  await openSheet(page, "Sleep")
  answer.open()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]?.actionId).toBe(bodies[0]?.actionId)
  expect(bodies[1]?.occurredAt).toBe(FIRST_TAP)
})
```

- [ ] **Step 2: Run them to see them fail.**
  - **Unit:** `pnpm exec vitest run apps/web/test/sheets-state.test.ts apps/web/test/sheet-openings.test.ts`. Expected: FAIL, 7 tests:
    - the six rows of "opens its own sheet again on the reason when the parent opened it after the send, without holding taps" (`opened` 2, expected 3)
    - sheet-openings' "is counted when a failure lands in its own open sheet, so the form starts again from the failure" (1, expected 2)

    The two "leaves …" tests pass already: they guard what must not change.
  - **E2E:** `pnpm exec playwright test --config .superpowers/e2e.config.ts held-failures`. Expected: FAIL, 4 of 4 runs. In both engines, the diaper's and the wake's second send carries a fresh actionId.
- [ ] **Step 3: Write the code.** `git checkout a020a50 -- apps/web/src/sheets/sending.ts apps/web/src/sheets/sheets-state.ts`:

`apps/web/src/sheets/sending.ts`:

```diff
--- a/apps/web/src/sheets/sending.ts
+++ b/apps/web/src/sheets/sending.ts
@@ -68,6 +68,8 @@ export const editsARecord = (sheet: SheetKind) => EDIT_SHEETS.has(sheet)
 
 export const opensOnOne = (sheet: SheetKind) => editsARecord(sheet) || sheet === "dose"
 
+export const addsOrEdits = (sheet: SheetKind | null) => sheet === "measurement"
+
 export const isUndo = ({ sheet }: Sending) => sheet === "undo"
 
 export const closesOnSend = (sending: Sending) =>
```

`apps/web/src/sheets/sheets-state.ts`:

```diff
--- a/apps/web/src/sheets/sheets-state.ts
+++ b/apps/web/src/sheets/sheets-state.ts
@@ -1,7 +1,15 @@
 import type { Action } from "../api/actions.ts"
 import type { Saved } from "../api/send.ts"
 import { actionIdOf, editingOf, heldFor, isOnOpening, settlesWithoutAsking, withoutAction } from "./held.ts"
-import { closesOnSave, closesOnSend, type Failed, isUndo, type Sending, type SheetKind } from "./sending.ts"
+import {
+  addsOrEdits,
+  closesOnSave,
+  closesOnSend,
+  type Failed,
+  isUndo,
+  type Sending,
+  type SheetKind,
+} from "./sending.ts"
 import { editLost, type Toast, toastFor, undoLost } from "./undo.ts"
 
 export interface SheetsState {
@@ -104,13 +112,20 @@ export const discardedState = (state: SheetsState, failed: Failed): SheetsState
   return state.asking ? closing({ ...state, held }) : { ...state, held }
 }
 
+const onTheRecordItOpenedWith = (state: SheetsState, failed: Failed) =>
+  !addsOrEdits(state.open) || editingOf(failed.sending) === state.editing
+
+const landsInItsOwnSheet = (state: SheetsState, failed: Failed, own: boolean) =>
+  closesOnSend(failed.sending) &&
+  (own || (isOnOpening(failed, state.open, state.editing) && onTheRecordItOpenedWith(state, failed)))
+
 export const failedState = (state: SheetsState, failed: Failed, now: number): SheetsState => {
   if (isUndo(failed.sending)) return { ...state, toast: undoLost(failed.error, now) }
   const own = state.keptOpen === actionIdOf(failed.sending)
   if (closesOnSave(failed.sending) && !own) return { ...state, toast: editLost(failed.error, now) }
   const held = [...state.held, failed]
   if (state.open === null) return opening({ ...state, held }, openingFor(failed), true)
-  if (own && closesOnSend(failed.sending)) return opening({ ...state, held }, openingFor(failed), false)
+  if (landsInItsOwnSheet(state, failed, own)) return opening({ ...state, held }, openingFor(failed), false)
   return { ...state, held, keptOpen: own ? null : state.keptOpen }
 }
 
```

- [ ] **Step 4: Run them to see them pass.** The same two commands. Expected: PASS, 4 E2E runs. Then:
  - `pnpm exec playwright test --config .superpowers/e2e.config.ts measurement first-tap`. Its two "keeps Add, with its typed weight…" tests pin M4.4's rule (P2), and first-tap pins #75's in-place reopen.
  - `pnpm test`, `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 5: Commit.** `git add apps/web/src/sheets apps/web/test e2e/held-failures.spec.ts`, then `git commit -m "A failure that lands in its own sheet, opened again after the send, opens that sheet again on the failure, as one that finds the sheet closed does: the form takes the first tap's time and actionId, so a second tap can't log a second diaper or wake her at the later time. The measurement sheet, which adds and edits under one opening, opens again only on the record it opened with (#92)"`.

### Task 2: Closing a sheet asks before it lets go of a failed control that could still be saved (#91)

**Files:**
- Create: `apps/web/src/sheets/discard-question.ts`, `apps/web/src/sheets/kept-on.ts`
- Modify: `apps/web/src/sheets/held.ts`, `sheets-state.ts`, `failure.ts`, `failure-note.tsx`, `discard-prompt.tsx`
- Test: create `apps/web/test/discard-question.test.ts`; modify `apps/web/test/sheets-state.test.ts`, `failure.test.ts`, `edit-sheets.test.ts`, `diaper-edit.test.ts`; modify `e2e/held-failures.spec.ts`, `e2e/failed-control.spec.ts`, `e2e/discard-entry.spec.ts`, `e2e/edit-diaper.spec.ts`

**Interfaces:**
- Consumes: `offersRetry` from `held.ts`; `isEntry` from `sheets-state.ts`; `timeOf` and `Household` from `failure.ts`; `SIDE_NAMES` from `sides.ts`; `useHousehold`.
- Produces:
  - `savesAsItIs(error: Error): boolean` in `held.ts`
  - `discardQuestion(sending: Sending, household: Household | null): string`
  - `keptOnFor(sending: Sending, keeping: boolean): KeptOn`
  - `KeptOn = "phone" | "app"`

- [ ] **Step 1: Write the failing tests.** `git checkout 86a27fd -- apps/web/test/sheets-state.test.ts apps/web/test/discard-question.test.ts apps/web/test/failure.test.ts apps/web/test/edit-sheets.test.ts apps/web/test/diaper-edit.test.ts e2e/held-failures.spec.ts e2e/failed-control.spec.ts e2e/discard-entry.spec.ts e2e/edit-diaper.spec.ts`. The changes:

`apps/web/test/sheets-state.test.ts`:

```diff
--- a/apps/web/test/sheets-state.test.ts
+++ b/apps/web/test/sheets-state.test.ts
@@ -1,11 +1,12 @@
 import { DoseConflict, FeedConflict } from "@bt/contracts"
 import { describe, expect, it } from "vitest"
 import type { Action } from "../src/api/actions.ts"
-import { Offline } from "../src/api/errors.ts"
+import { AuthRequired, Offline } from "../src/api/errors.ts"
 import { heldFor } from "../src/sheets/held.ts"
 import { closesOnSend, type Failed, type Sending } from "../src/sheets/sending.ts"
 import {
   CLOSED,
+  discardedState,
   dismissedState,
   expiredState,
   failedState,
@@ -674,3 +675,54 @@ describe("a dose sheet opened from History's Log at menu", () => {
     expect(heldFor(onlyOther.held, "dose", onlyOther.editing)).toBeNull()
   })
 })
+
+describe("closing a sheet that holds a failed control", () => {
+  const shownWith = (failed: Failed) => failedState(CLOSED, failed, NOW)
+
+  it.each([
+    { label: "a wake", sending: WOKE },
+    { label: "a pause", sending: PAUSE },
+    { label: "a switch", sending: SWITCH },
+    { label: "a resume", sending: RESUME },
+    { label: "a finish", sending: FINISH },
+    { label: "an edit", sending: DOSE_MOVED },
+    { label: "a delete", sending: SLEEP_DELETED },
+  ])("asks before letting it go while it could still be saved as it is: $label", ({ sending }) => {
+    const failed = { sending, error: new Offline() }
+    expect(dismissedState(shownWith(failed))).toMatchObject({ open: sending.sheet, asking: true, held: [failed] })
+  })
+
+  it("asks for one that waits on a sign-in or wasn't saved for another reason", () => {
+    for (const error of [new AuthRequired(), new Error("Not saved")]) {
+      expect(dismissedState(shownWith({ sending: WOKE, error }))).toMatchObject({ open: "sleep", asking: true })
+    }
+  })
+
+  it("lets one go without asking when it can't be saved as it is", () => {
+    const current = feedAt(NOW, { id: "feed-1", version: 4 })
+    const failed = { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current }) }
+    expect(dismissedState(shownWith(failed))).toMatchObject({ open: null, asking: false, held: [] })
+  })
+
+  it("lets it go once the parent discards it", () => {
+    const failed = { sending: WOKE, error: new Offline() }
+    const asking = dismissedState(shownWith(failed))
+    expect(discardedState(asking, failed)).toMatchObject({ open: null, asking: false, held: [] })
+  })
+
+  it("keeps it while a sheet opened from its own is open, and opens its sheet again once that one closes", () => {
+    const failed = { sending: PAUSE, error: new Offline() }
+    const bottle = shownState(shownWith(failed), "bottle")
+    expect(bottle).toMatchObject({ open: "bottle", held: [failed] })
+    expect(dismissedState(bottle)).toMatchObject({ open: "nursing", queued: true, held: [failed] })
+  })
+
+  it("lets it go when another control on its sheet is sent, which acts at its own tap", () => {
+    const failed = { sending: PAUSE, error: new Offline() }
+    const switched: Sending = {
+      sheet: "nursing",
+      action: { kind: "switchSide", id: "feed-1", payload: { actionId: RENEWED, version: 3, occurredAt: NOW } },
+    }
+    expect(sendingState(shownWith(failed), switched, true).held).toEqual([])
+  })
+})
```

`apps/web/test/discard-question.test.ts` (new):

```ts
import { describe, expect, it } from "vitest"
import { discardQuestion } from "../src/sheets/discard-question.ts"
import type { Household } from "../src/sheets/failure.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { ANDREW, EMILY, NOW, ZONE } from "./today-fixtures.ts"

const HOUSEHOLD: Household = {
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  timeZone: ZONE,
  childName: "Robin",
  locale: "en-US",
}

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const TAPPED = NOW + 37_000

const WOKE: Sending = {
  sheet: "sleep",
  action: { kind: "wakeSleep", id: "sleep-1", payload: { actionId: ACTION_ID, version: 1, occurredAt: TAPPED } },
}

const asked = (sending: Sending, household: Household | null = HOUSEHOLD) =>
  discardQuestion(sending, household).replace(/\s/gu, " ")

describe("discardQuestion", () => {
  it.each<[string, Sending]>([
    ["Discard the wake-up at 9:30 AM?", WOKE],
    [
      "Discard the pause at 9:30 AM?",
      {
        sheet: "nursing",
        action: { kind: "pauseFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED } },
      },
    ],
    [
      "Discard the switch at 9:30 AM?",
      {
        sheet: "nursing",
        action: { kind: "switchSide", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED } },
      },
    ],
    [
      "Discard resuming on Right at 9:30 AM?",
      {
        sheet: "nursing",
        action: {
          kind: "resumeFeed",
          id: "feed-1",
          payload: { actionId: ACTION_ID, version: 3, side: "right", occurredAt: TAPPED },
        },
      },
    ],
    [
      "Discard the finish at 9:30 AM?",
      {
        sheet: "nursing",
        action: {
          kind: "finishFeed",
          id: "feed-1",
          payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED, deleteIfEmpty: false },
        },
      },
    ],
  ])("names a failed control by the time it was tapped: %s", (question, sending) => {
    expect(asked(sending)).toBe(question)
  })

  it.each<[string, Sending]>([
    [
      "Discard your changes?",
      {
        sheet: "editDose",
        action: { kind: "editDose", id: "dose-1", payload: { actionId: ACTION_ID, version: 1, occurredAt: TAPPED } },
      },
    ],
    [
      "Discard your changes?",
      {
        sheet: "sleep",
        action: {
          kind: "editSleep",
          id: "sleep-1",
          payload: { actionId: ACTION_ID, version: 1, kind: "night", startedAt: NOW - 3_600_000, endedAt: null },
        },
      },
    ],
    [
      "Discard the delete?",
      { sheet: "sleep", action: { kind: "deleteSleep", id: "sleep-1", payload: { actionId: ACTION_ID, version: 2 } } },
    ],
    [
      "Discard the restore?",
      {
        sheet: "diaper",
        action: { kind: "restoreDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 2 } },
      },
    ],
    [
      "Discard this entry?",
      {
        sheet: "diaper",
        action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: TAPPED, wet: true, dirty: false } },
      },
    ],
  ])("says what an edit, a delete, a restore or an entry would lose: %s", (question, sending) => {
    expect(asked(sending)).toBe(question)
  })

  it("leaves the time out while the household hasn't loaded", () => {
    expect(asked(WOKE, null)).toBe("Discard the wake-up?")
  })
})
```

`apps/web/test/failure.test.ts`:

```diff
--- a/apps/web/test/failure.test.ts
+++ b/apps/web/test/failure.test.ts
@@ -16,7 +16,9 @@ import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"
 import { StaleDraft } from "../src/sheets/drafts.ts"
 import { failureNote, type Household } from "../src/sheets/failure.ts"
 import { offersRetry } from "../src/sheets/held.ts"
+import { keptOnFor } from "../src/sheets/kept-on.ts"
 import { Unsaved } from "../src/sheets/kept.ts"
+import type { Sending } from "../src/sheets/sending.ts"
 import { measurement } from "./growth-fixtures.ts"
 import { ANDREW, diaperAt, dosedAt, EMILY, feedAt, MINUTE, NOW, sleptAt, ZONE } from "./today-fixtures.ts"
 
@@ -30,11 +32,28 @@ const HOUSEHOLD: Household = {
   locale: "en-US",
 }
 
+const WOKE: Sending = {
+  sheet: "sleep",
+  action: {
+    kind: "wakeSleep",
+    id: "sleep-1",
+    payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", version: 1, occurredAt: NOW },
+  },
+}
+
+const DIAPER: Sending = {
+  sheet: "diaper",
+  action: {
+    kind: "logDiaper",
+    payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", occurredAt: NOW, wet: true, dirty: false },
+  },
+}
+
 const message = (error: Error) => failureNote(error, HOUSEHOLD, { keptOn: "phone" }).message.replace(/\s/gu, " ")
 
 const staleSleep = (current: Sleep, action: Action["kind"]) => {
   const error = new SleepConflict({ code: "STALE_VERSION", current })
-  return failureNote(error, HOUSEHOLD, { keptOn: null, sheet: "sleep", action }).message.replace(/\s/gu, " ")
+  return failureNote(error, HOUSEHOLD, { keptOn: "app", sheet: "sleep", action }).message.replace(/\s/gu, " ")
 }
 
 describe("failureNote", () => {
@@ -53,14 +72,18 @@ describe("failureNote", () => {
     )
   })
 
-  it("promises nothing kept for a control with no connection, since it goes with its sheet", () => {
-    expect(failureNote(new Offline(), HOUSEHOLD, { keptOn: null })).toEqual({
-      message: "No connection. Try again once you're back online.",
+  it("asks to keep the app open for a control with no connection, since its sheet asks before letting it go", () => {
+    expect(failureNote(new Offline(), HOUSEHOLD, { keptOn: keptOnFor(WOKE, true) })).toEqual({
+      message: "No connection. Keep the app open, and try again once you're back online.",
       retry: "Try again",
       signIn: false,
     })
   })
 
+  it("keeps an entry on this phone while the phone can keep it, and asks to keep the app open when it can't", () => {
+    expect([keptOnFor(DIAPER, true), keptOnFor(DIAPER, false)]).toEqual(["phone", "app"])
+  })
+
   it("asks to sign in when Access or the household has signed the parent out", () => {
     for (const error of [new AuthRequired(), new Unauthorized()]) {
       expect(failureNote(error, HOUSEHOLD, { keptOn: "phone" })).toEqual({
@@ -163,7 +186,7 @@ describe("failureNote", () => {
 
   it("explains a refused sleep time in a sleep's words", () => {
     const refused = (issue: "end_not_after_start" | "out_of_range", sheet: "sleep" | "pastSleep" | "editSleep") =>
-      failureNote(new InvalidInput({ fieldErrors: [{ path: "endedAt", issue }] }), HOUSEHOLD, { keptOn: null, sheet })
+      failureNote(new InvalidInput({ fieldErrors: [{ path: "endedAt", issue }] }), HOUSEHOLD, { keptOn: "app", sheet })
         .message
     expect(refused("end_not_after_start", "sleep")).toBe("Pick a time after she fell asleep.")
     expect(refused("out_of_range", "pastSleep")).toBe("A sleep can last a day at most.")
@@ -173,7 +196,7 @@ describe("failureNote", () => {
   it("asks a sleep sheet to check only the times when the household refuses a field with no message of its own", () => {
     const refused = (sheet: "sleep" | "pastSleep" | "editSleep" | "pastFeed" | "diaper") =>
       failureNote(new InvalidInput({ fieldErrors: [{ path: "kind", issue: "invalid" }] }), HOUSEHOLD, {
-        keptOn: null,
+        keptOn: "app",
         sheet,
       }).message
     expect([refused("sleep"), refused("pastSleep"), refused("editSleep")]).toEqual([
@@ -282,6 +305,6 @@ describe("offersRetry", () => {
     ["a sleep conflict", new SleepConflict({ code: "STALE_VERSION", current: sleptAt(NOW) })],
     ["a dose that day already", new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current: dosedAt(NOW) })],
   ])("is true exactly when the note offers a retry button: %s", (_case, error) => {
-    expect(offersRetry(error)).toBe(failureNote(error, HOUSEHOLD, { keptOn: null }).retry !== null)
+    expect(offersRetry(error)).toBe(failureNote(error, HOUSEHOLD, { keptOn: "app" }).retry !== null)
   })
 })
```

`apps/web/test/edit-sheets.test.ts`:

```diff
--- a/apps/web/test/edit-sheets.test.ts
+++ b/apps/web/test/edit-sheets.test.ts
@@ -5,6 +5,7 @@ import { heldFor } from "../src/sheets/held.ts"
 import { closesOnSend, type Failed, type Sending } from "../src/sheets/sending.ts"
 import {
   CLOSED,
+  discardedState,
   dismissedKindState,
   dismissedState,
   failedState,
@@ -53,11 +54,12 @@ describe("an edit sheet", () => {
     expect(heldFor(other.held, "editDiaper", "diaper-1")).toBe(failed)
   })
 
-  it("lets its own record's failure go as it closes, and then opens the other record's", () => {
+  it("asks before letting its own record's failure go as it closes, and then opens the other record's", () => {
     const first = offline(edited("diaper-1", "action-1"))
     const second = offline(edited("diaper-2", "action-2"))
-    const state = dismissedState(afterFailures(first, second))
-    expect(state).toMatchObject({ open: "editDiaper", editing: "diaper-2", held: [second] })
+    const asking = dismissedState(afterFailures(first, second))
+    expect(asking).toMatchObject({ open: "editDiaper", editing: "diaper-1", asking: true })
+    expect(discardedState(asking, first)).toMatchObject({ open: "editDiaper", editing: "diaper-2", held: [second] })
   })
 
   it("keeps a held new entry while it closes, and opens that entry's sheet next", () => {
```

`apps/web/test/diaper-edit.test.ts`:

```diff
--- a/apps/web/test/diaper-edit.test.ts
+++ b/apps/web/test/diaper-edit.test.ts
@@ -79,7 +79,7 @@ describe("editing a diaper", () => {
   })
 
   it("says the diaper was deleted when the household no longer has it", () => {
-    expect(failureNote(new NotFound(), HOUSEHOLD, { keptOn: null, sheet: "editDiaper" }).message).toBe(
+    expect(failureNote(new NotFound(), HOUSEHOLD, { keptOn: "app", sheet: "editDiaper" }).message).toBe(
       "This was deleted since it opened.",
     )
   })
```

`e2e/held-failures.spec.ts`:

```diff
--- a/e2e/held-failures.spec.ts
+++ b/e2e/held-failures.spec.ts
@@ -8,6 +8,7 @@ import {
   openToday,
   playHousehold,
   quickAction,
+  runningFeed,
   runningSleep,
   savedDiaper,
   sleepingToday,
@@ -78,3 +79,60 @@ test("a wake whose send fails after the Sleep sheet was opened again saves the f
   expect(bodies[1]?.actionId).toBe(bodies[0]?.actionId)
   expect(bodies[1]?.occurredAt).toBe(FIRST_TAP)
 })
+
+test("a wake that failed offline asks before its sheet lets it go, and Keep leaves it to save at the first tap's time", async ({
+  page,
+  context,
+}) => {
+  const { andrew } = await caregiversOf(page)
+  const sleep = runningSleep(andrew.id, STARTED)
+  await playHousehold(page, sleepingToday(sleep))
+  const bodies = await loseSaves(page, "**/api/sleeps/sleep-1/wake", {
+    lost: 1,
+    until: Promise.resolve(),
+    answer: (body) => ({ sleep: { ...sleep, endedAt: body.occurredAt ?? NOW, version: 2 }, changed: [["today"]] }),
+  })
+  await openToday(page)
+  await context.setOffline(true)
+  await expect(page.getByRole("alert").filter({ hasText: "No connection" }).first()).toBeVisible()
+  await page.clock.setFixedTime(FIRST_TAP)
+  const sheet = await openSheet(page, "Sleep")
+  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
+  await expect(sheet.getByRole("alert")).toContainText(
+    "No connection. Keep the app open, and try again once you're back online.",
+  )
+  await page.keyboard.press("Escape")
+  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the wake-up at 9:30\sAM\?DiscardKeep$/u)
+  await sheet.getByRole("button", { name: "Keep" }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  await page.clock.setFixedTime(FIRST_TAP + 15 * MINUTE)
+  await context.setOffline(false)
+  await sheet.getByRole("button", { name: "Try again" }).click()
+  await expect.poll(() => bodies.length).toBe(2)
+  expect(bodies[1]?.actionId).toBe(bodies[0]?.actionId)
+  expect(bodies[1]?.occurredAt).toBe(FIRST_TAP)
+})
+
+test("a pause that failed asks before its sheet lets it go, and Discard lets it go unsent", async ({ page }) => {
+  const { andrew } = await caregiversOf(page)
+  const feed = runningFeed(andrew.id, STARTED, "left")
+  await playHousehold(page, todayWith(feed))
+  const bodies = await loseSaves(page, "**/api/feeds/feed-1/pause", {
+    lost: 1,
+    until: Promise.resolve(),
+    answer: () => ({ feed: { ...feed, version: 2 }, changed: [["today"]] }),
+  })
+  await openToday(page)
+  await page.clock.setFixedTime(FIRST_TAP)
+  const sheet = await openSheet(page, "Nursing")
+  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  await page.keyboard.press("Escape")
+  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
+  await sheet.getByRole("button", { name: "Discard" }).click()
+  await expect(sheet).toBeHidden()
+  await openSheet(page, "Nursing")
+  await expect(sheet.getByRole("button", { name: "Pause", exact: true })).toBeVisible()
+  await expect(sheet.getByRole("alert")).toHaveCount(0)
+  expect(bodies).toHaveLength(1)
+})
```

`e2e/failed-control.spec.ts`:

```diff
--- a/e2e/failed-control.spec.ts
+++ b/e2e/failed-control.spec.ts
@@ -10,7 +10,9 @@ import {
 } from "./played-household.ts"
 import { expect, test } from "./test.ts"
 
-test("promises nothing kept when a pause fails with no connection, since it goes with its sheet", async ({ page }) => {
+test("asks to keep the app open when a pause fails with no connection, since its sheet asks before letting it go", async ({
+  page,
+}) => {
   const { andrew } = await caregiversOf(page)
   await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
   await page.route("**/api/feeds/feed-1/pause", (route) => route.abort("internetdisconnected"))
@@ -18,5 +20,7 @@ test("promises nothing kept when a pause fails with no connection, since it goes
   await quickAction(page, "Nursing").click()
   const sheet = page.getByRole("dialog", { name: "Nursing" })
   await sheet.getByRole("button", { name: "Pause" }).click()
-  await expect(sheet.getByRole("alert")).toContainText("No connection. Try again once you're back online.")
+  await expect(sheet.getByRole("alert")).toContainText(
+    "No connection. Keep the app open, and try again once you're back online.",
+  )
 })
```

`e2e/discard-entry.spec.ts`:

```diff
--- a/e2e/discard-entry.spec.ts
+++ b/e2e/discard-entry.spec.ts
@@ -110,7 +110,7 @@ test("drops the sign-in draft of an entry sent again after Sign in, so the next
   expect(sent).toEqual([sent[0], sent[0]])
 })
 
-test("drops the sign-in draft of a control its sheet let go, so the next load doesn't send it", async ({
+test("drops the sign-in draft of a control discarded as its sheet closes, so the next load doesn't send it", async ({
   page,
   context,
   baseURL,
@@ -132,6 +132,8 @@ test("drops the sign-in draft of a control its sheet let go, so the next load do
   await sheet.getByRole("link", { name: "Sign in" }).click()
   await expect.poll(() => draftKept(page)).not.toBeNull()
   await page.keyboard.press("Escape")
+  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
+  await sheet.getByRole("button", { name: "Discard" }).click()
   await expect(sheet).toBeHidden()
   await expect.poll(() => draftKept(page)).toBeNull()
   await context.clearCookies()
```

`e2e/edit-diaper.spec.ts`:

```diff
--- a/e2e/edit-diaper.spec.ts
+++ b/e2e/edit-diaper.spec.ts
@@ -179,9 +179,13 @@ test("puts the diaper back and reopens its sheet with the reason when the edit c
   const sheet = await openTheDiaper(page)
   await sheet.getByRole("button", { name: "Poo" }).click()
   await sheet.getByRole("button", { name: "Save" }).click()
-  await expect(sheet.getByRole("alert")).toContainText("No connection. Try again once you're back online.")
+  await expect(sheet.getByRole("alert")).toContainText(
+    "No connection. Keep the app open, and try again once you're back online.",
+  )
   await expect(sheet.getByRole("button", { name: "Poo" })).toHaveAttribute("aria-pressed", "true")
   await page.keyboard.press("Escape")
+  await expect(sheet.getByRole("alert")).toHaveText("Discard your changes?DiscardKeep")
+  await sheet.getByRole("button", { name: "Discard" }).click()
   await expect(sheet).toBeHidden()
   await expect(recent(page).getByRole("button", { name: /Diaper/u })).toContainText("Pee")
 })
```

- [ ] **Step 2: Run them to see them fail.**
  - **Unit:** `pnpm exec vitest run apps/web/test/sheets-state.test.ts apps/web/test/discard-question.test.ts apps/web/test/failure.test.ts apps/web/test/edit-sheets.test.ts apps/web/test/diaper-edit.test.ts`. Expected: FAIL, 10 tests:
    - sheets-state's seven "asks before letting it go while it could still be saved as it is" rows
    - "asks for one that waits on a sign-in or wasn't saved for another reason"
    - "keeps it while a sheet opened from its own is open, and opens its sheet again once that one closes"
    - edit-sheets' "asks before letting its own record's failure go as it closes, and then opens the other record's"

    Two files fail to load, since `discard-question.ts` and `kept-on.ts` don't exist yet. The three "lets … go" tests pass already: they guard the old rule where it stays. `diaper-edit.test.ts`'s change is a type, so it passes.
  - **E2E:** `pnpm exec playwright test --config .superpowers/e2e.config.ts held-failures failed-control discard-entry edit-diaper`. Expected: FAIL, 10 of 32 runs: held-failures' wake and pause, failed-control, `discard-entry.spec.ts:113` and `edit-diaper.spec.ts:176`, each in both engines.
- [ ] **Step 3: Write the code.** Invoke `frontend-ui-expert` and `react-code-standards` first. Then `git checkout 86a27fd -- apps/web/src/sheets/held.ts apps/web/src/sheets/sheets-state.ts apps/web/src/sheets/failure.ts apps/web/src/sheets/failure-note.tsx apps/web/src/sheets/discard-prompt.tsx apps/web/src/sheets/discard-question.ts apps/web/src/sheets/kept-on.ts`:

`apps/web/src/sheets/held.ts`:

```diff
--- a/apps/web/src/sheets/held.ts
+++ b/apps/web/src/sheets/held.ts
@@ -58,6 +58,9 @@ const refusesAnotherTry = (error: Error) =>
 
 export const offersRetry = (error: Error) => !refusesAnotherTry(error)
 
+export const savesAsItIs = (error: Error) =>
+  offersRetry(error) || error instanceof AuthRequired || error instanceof Unauthorized
+
 const switchesTo = ({ action }: Sending) => (action.kind === "switchSide" ? action.to : undefined)
 
 const sameControl = (held: Sending, fresh: Sending) =>
```

`apps/web/src/sheets/sheets-state.ts`:

```diff
--- a/apps/web/src/sheets/sheets-state.ts
+++ b/apps/web/src/sheets/sheets-state.ts
@@ -1,6 +1,14 @@
 import type { Action } from "../api/actions.ts"
 import type { Saved } from "../api/send.ts"
-import { actionIdOf, editingOf, heldFor, isOnOpening, settlesWithoutAsking, withoutAction } from "./held.ts"
+import {
+  actionIdOf,
+  editingOf,
+  heldFor,
+  isOnOpening,
+  savesAsItIs,
+  settlesWithoutAsking,
+  withoutAction,
+} from "./held.ts"
 import {
   addsOrEdits,
   closesOnSave,
@@ -49,10 +57,15 @@ const NEW_ENTRIES = new Set<Action["kind"]>([
 
 export const isEntry = ({ action }: Sending) => NEW_ENTRIES.has(action.kind)
 
-const goesWithItsSheet = ({ sending, error }: Failed) => !isEntry(sending) || settlesWithoutAsking(error)
+const asksFirst = ({ sending, error }: Failed) => (isEntry(sending) ? !settlesWithoutAsking(error) : savesAsItIs(error))
+
+const goesOnAnotherSend = ({ sending, error }: Failed) => !isEntry(sending) || settlesWithoutAsking(error)
 
 const withoutGoing = (held: ReadonlyArray<Failed>, sheet: SheetKind | null, editing: string | null) =>
-  held.filter((failed) => !isOnOpening(failed, sheet, editing) || !goesWithItsSheet(failed))
+  held.filter((failed) => !isOnOpening(failed, sheet, editing) || asksFirst(failed))
+
+const withoutReplaced = (held: ReadonlyArray<Failed>, sheet: SheetKind | null, editing: string | null) =>
+  held.filter((failed) => !isOnOpening(failed, sheet, editing) || !goesOnAnotherSend(failed))
 
 interface Opening {
   readonly sheet: SheetKind | null
@@ -99,7 +112,7 @@ export const shownState = (
 export const dismissedState = (state: SheetsState): SheetsState => {
   if (state.open === null) return state
   const shown = heldFor(state.held, state.open, state.editing)
-  return shown !== null && !goesWithItsSheet(shown) ? { ...state, asking: true } : closing(state)
+  return shown !== null && asksFirst(shown) ? { ...state, asking: true } : closing(state)
 }
 
 export const dismissedKindState = (state: SheetsState, sheet: SheetKind): SheetsState =>
@@ -138,7 +151,7 @@ export const reopenedState = (state: SheetsState): SheetsState => {
 
 export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => {
   const toast = isUndo(sending) ? null : state.toast
-  const held = withoutGoing(withoutAction(state.held, actionIdOf(sending)), sending.sheet, editingOf(sending))
+  const held = withoutReplaced(withoutAction(state.held, actionIdOf(sending)), sending.sheet, editingOf(sending))
   const sent = { ...state, held, toast }
   if (closesOnSend(sending) && online) return state.open === null ? sent : closing(sent)
   if (!closesOnSend(sending) && !closesOnSave(sending)) return sent
```

`apps/web/src/sheets/discard-question.ts` (new):

```ts
import type { Action } from "../api/actions.ts"
import { SIDE_NAMES } from "../sides.ts"
import { type Household, timeOf } from "./failure.ts"
import type { Sending } from "./sending.ts"

const LOST = {
  logDiaper: "this entry",
  editDiaper: "your changes",
  deleteDiaper: "the delete",
  restoreDiaper: "the restore",
  logFeed: "this entry",
  startFeed: "this entry",
  switchSide: "the switch",
  pauseFeed: "the pause",
  resumeFeed: "resuming",
  addBottle: "this entry",
  finishFeed: "the finish",
  editFeed: "your changes",
  editSegment: "your changes",
  deleteFeed: "the delete",
  deletePortion: "the delete",
  editPortion: "your changes",
  restoreFeed: "the restore",
  logMeasurement: "this entry",
  editMeasurement: "your changes",
  deleteMeasurement: "the delete",
  restoreMeasurement: "the restore",
  logSleep: "this entry",
  startSleep: "this entry",
  wakeSleep: "the wake-up",
  editSleep: "your changes",
  deleteSleep: "the delete",
  restoreSleep: "the restore",
  logDose: "this entry",
  editDose: "your changes",
  deleteDose: "the delete",
  restoreDose: "the restore",
} as const satisfies Record<Action["kind"], string>

const TAPPED = new Set<Action["kind"]>(["switchSide", "pauseFeed", "resumeFeed", "finishFeed", "wakeSleep"])

const lostWith = (action: Action) =>
  action.kind === "resumeFeed" ? `resuming on ${SIDE_NAMES[action.payload.side]}` : LOST[action.kind]

const tappedAt = (action: Action) =>
  TAPPED.has(action.kind) && "occurredAt" in action.payload ? action.payload.occurredAt : null

export const discardQuestion = ({ action }: Sending, household: Household | null) => {
  const at = tappedAt(action)
  const when = at === null || household === null ? "" : ` at ${timeOf(household, at)}`
  return `Discard ${lostWith(action)}${when}?`
}
```

`apps/web/src/sheets/kept-on.ts` (new):

```ts
import type { KeptOn } from "./failure.ts"
import type { Sending } from "./sending.ts"
import { isEntry } from "./sheets-state.ts"

export const keptOnFor = (sending: Sending, keeping: boolean): KeptOn => (isEntry(sending) && keeping ? "phone" : "app")
```

`apps/web/src/sheets/failure.ts`:

```diff
--- a/apps/web/src/sheets/failure.ts
+++ b/apps/web/src/sheets/failure.ts
@@ -149,7 +149,7 @@ const GONE = "This has changed since it opened. Today is up to date now."
 
 const MEASUREMENT_GONE = "This measurement has changed since it opened. Growth is up to date now."
 
-export type KeptOn = "phone" | "app" | null
+export type KeptOn = "phone" | "app"
 
 export interface NoteOptions {
   readonly keptOn: KeptOn
@@ -162,8 +162,7 @@ const OFFLINE = {
   app: "No connection. Keep the app open, and try again once you're back online.",
 }
 
-const offlineNote = (keptOn: KeptOn): Note =>
-  note(keptOn === null ? "No connection. Try again once you're back online." : OFFLINE[keptOn], TRY_AGAIN)
+const offlineNote = (keptOn: KeptOn): Note => note(OFFLINE[keptOn], TRY_AGAIN)
 
 const EDITED_GONE = "This was deleted since it opened."
 
```

`apps/web/src/sheets/failure-note.tsx`:

```diff
--- a/apps/web/src/sheets/failure-note.tsx
+++ b/apps/web/src/sheets/failure-note.tsx
@@ -4,10 +4,10 @@ import { Button, buttonVariants } from "../components/ui/button.tsx"
 import { signInUrl } from "../shell/sign-in.ts"
 import { draftStorage, stashDraft } from "./drafts.ts"
 import { failureNote } from "./failure.ts"
+import { keptOnFor } from "./kept-on.ts"
 import { RecoveryButtons } from "./recovery-buttons.tsx"
 import type { Sending, SheetKind } from "./sending.ts"
 import { failedFor, useSheets } from "./sheets-context.ts"
-import { isEntry } from "./sheets-state.ts"
 import { useHousehold } from "./use-household.ts"
 
 const CANT_KEEP = "This phone can't keep the entry while you sign in. Sign in, then log it again."
@@ -54,7 +54,7 @@ export const FailureNote = ({ sheet }: { readonly sheet: SheetKind }) => {
   const household = useHousehold()
   const failed = failedFor(sheets, sheet)
   if (failed === null || household === null) return null
-  const keptOn = isEntry(failed.sending) ? (sheets.keeping ? "phone" : "app") : null
+  const keptOn = keptOnFor(failed.sending, sheets.keeping)
   const { message, retry, signIn } = failureNote(failed.error, household, {
     keptOn,
     sheet,
```

`apps/web/src/sheets/discard-prompt.tsx`:

```diff
--- a/apps/web/src/sheets/discard-prompt.tsx
+++ b/apps/web/src/sheets/discard-prompt.tsx
@@ -1,14 +1,17 @@
 import { Button } from "../components/ui/button.tsx"
+import { discardQuestion } from "./discard-question.ts"
 import type { Failed } from "./sending.ts"
 import { useSheets } from "./sheets-context.ts"
+import { useHousehold } from "./use-household.ts"
 
 const focusOnArrival = (button: HTMLButtonElement | null) => button?.focus()
 
 export const DiscardPrompt = ({ failed }: { readonly failed: Failed }) => {
   const sheets = useSheets()
+  const household = useHousehold()
   return (
     <div role="alert" className="flex flex-col gap-3">
-      <p className="text-base">Discard this entry?</p>
+      <p className="text-base">{discardQuestion(failed.sending, household)}</p>
       <Button variant="destructive" size="lg" onClick={() => sheets.discard(failed)}>
         Discard
       </Button>
```

- [ ] **Step 4: Run them to see them pass.** The same two commands. Expected: PASS, 32 E2E runs. Then `pnpm exec playwright test --config .superpowers/e2e.config.ts empty-finish nursing closing-sheet kept-entries held-entries`, which close sheets after failures that must still close without asking. Then `pnpm test`, `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 5: Commit.** `git add apps/web e2e`, then `git commit -m "Closing a sheet asks before it lets go of a failed control that could still be saved as it is, as entries do: Wake up, Finish, Pause, Switch, Resume, Nap or night, every edit and every delete. The question names what would be lost and when it was tapped, and the control's no-connection note asks to keep the app open (#91)"`.

### Task 3: #93's minors: Try again from `offersRetry`, and the tests #93 lacked

**Files:**
- Modify: `apps/web/src/sheets/failure.ts`
- Test: modify `apps/web/test/retap.test.ts`, `apps/web/test/sheets-state.test.ts`, `e2e/first-tap.spec.ts`, `e2e/held-failures.spec.ts`

**Interfaces:**
- Consumes: `offersRetry` from `held.ts`; `loseSaves`, `playHousehold` and `todayWith` from `e2e/played-household.ts`; first-tap's `playSends`, `goOffline`, `comeBackOnline`, `sentOnce` and `pausedFeed`.
- Produces: nothing new.

- [ ] **Step 1: Write the tests.** `git checkout c66db8f -- apps/web/test/retap.test.ts apps/web/test/sheets-state.test.ts e2e/first-tap.spec.ts e2e/held-failures.spec.ts`:

`apps/web/test/retap.test.ts`:

```diff
--- a/apps/web/test/retap.test.ts
+++ b/apps/web/test/retap.test.ts
@@ -52,6 +52,13 @@ describe("a control tapped again while its failure is held", () => {
     expect(retapped(held(pause("action-first")), otherFeed)).toBe(otherFeed)
   })
 
+  it("sends a held delete again, as Try again does", () => {
+    const remove = (actionId: string) =>
+      nursing({ kind: "deleteFeed", id: "feed-1", payload: { actionId, version: 3 } })
+    const first = remove("action-first")
+    expect(retapped(held(first), remove("action-later"))).toBe(first)
+  })
+
   it("sends what was tapped when nothing is held", () => {
     const tapped = pause("action-first")
     expect(retapped(null, tapped)).toBe(tapped)
```

`apps/web/test/sheets-state.test.ts`:

```diff
--- a/apps/web/test/sheets-state.test.ts
+++ b/apps/web/test/sheets-state.test.ts
@@ -717,12 +717,21 @@ describe("closing a sheet that holds a failed control", () => {
     expect(dismissedState(bottle)).toMatchObject({ open: "nursing", queued: true, held: [failed] })
   })
 
+  const SWITCHED: Sending = {
+    sheet: "nursing",
+    action: { kind: "switchSide", id: "feed-1", payload: { actionId: RENEWED, version: 3, occurredAt: NOW } },
+  }
+
   it("lets it go when another control on its sheet is sent, which acts at its own tap", () => {
     const failed = { sending: PAUSE, error: new Offline() }
-    const switched: Sending = {
-      sheet: "nursing",
-      action: { kind: "switchSide", id: "feed-1", payload: { actionId: RENEWED, version: 3, occurredAt: NOW } },
-    }
-    expect(sendingState(shownWith(failed), switched, true).held).toEqual([])
+    expect(sendingState(shownWith(failed), SWITCHED, true).held).toEqual([])
+  })
+
+  it("holds one failed control on a running feed at a time, so a tap again meets the latest failure", () => {
+    const paused = { sending: PAUSE, error: new Offline() }
+    const switched = { sending: SWITCHED, error: new Offline() }
+    const state = failedState(sendingState(shownWith(paused), SWITCHED, true), switched, NOW)
+    expect(state.held).toEqual([switched])
+    expect(heldFor(state.held, "nursing")).toBe(switched)
   })
 })
```

`e2e/first-tap.spec.ts`:

```diff
--- a/e2e/first-tap.spec.ts
+++ b/e2e/first-tap.spec.ts
@@ -296,6 +296,29 @@ const CONTROLS: ReadonlyArray<Control> = [
   },
 ]
 
+test("A paused feed's Finish, tapped again after its send failed offline, saves the first tap's time", async ({
+  page,
+  context,
+}) => {
+  const { andrew } = await caregiversOf(page)
+  const feed = pausedFeed(andrew.id)
+  await playHousehold(page, todayWith(feed))
+  const phone = await playSends(page, "**/api/feeds/feed-1/finish", (body) =>
+    savedFeed({ ...feed, status: "completed", endedAt: body.occurredAt ?? NOW, version: 2 }),
+  )
+  await openToday(page)
+  await goOffline(page, context)
+  await page.clock.setFixedTime(FIRST_TAP)
+  const sheet = await openSheet(page, "Nursing")
+  await sheet.getByRole("button", { name: /^Finish$/u }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  await comeBackOnline(page, context, phone)
+  await sheet.getByRole("button", { name: /^Finish$/u }).click()
+  await expect.poll(() => phone.bodies.length).toBe(2)
+  expect(phone.bodies[1]?.occurredAt).toBe(FIRST_TAP)
+  expect(sentOnce(phone)).toBe(true)
+})
+
 for (const control of CONTROLS) {
   test(`${control.name} tapped again after its send failed saves the first tap's time`, async ({ page }) => {
     const { andrew } = await caregiversOf(page)
```

`e2e/held-failures.spec.ts`:

```diff
--- a/e2e/held-failures.spec.ts
+++ b/e2e/held-failures.spec.ts
@@ -136,3 +136,28 @@ test("a pause that failed asks before its sheet lets it go, and Discard lets it
   await expect(sheet.getByRole("alert")).toHaveCount(0)
   expect(bodies).toHaveLength(1)
 })
+
+test("a diaper changed after its first send landed unanswered keeps that send's actionId, so the household says it was already saved", async ({
+  page,
+}) => {
+  await playHousehold(page, todayWith())
+  const sent: Array<{ readonly actionId?: string; readonly dirty?: boolean }> = []
+  const answered: number[] = []
+  await page.route("**/api/diapers", async (route) => {
+    if (route.request().method() !== "POST") return route.fallback()
+    sent.push(route.request().postDataJSON())
+    const response = await route.fetch()
+    answered.push(response.status())
+    if (sent.length === 1) return route.abort("internetdisconnected")
+    return route.fulfill({ response })
+  })
+  await openToday(page)
+  const sheet = await openSheet(page, "Diaper")
+  await sheet.getByRole("button", { name: "Pee" }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  await sheet.getByRole("button", { name: "Poo" }).click()
+  await expect(sheet.getByRole("alert")).toContainText("This was already saved as you first entered it.")
+  expect(sent.map(({ actionId }) => actionId)).toEqual([sent[0]?.actionId, sent[0]?.actionId])
+  expect(sent[1]?.dirty).toBe(true)
+  expect(answered).toEqual([201, 409])
+})
```

- [ ] **Step 2: Run them.** These tests pin behaviour #93 left untested, so they pass on Task 2's code. That was measured on its replay: 169 unit tests in the three files, and 36 E2E runs. In the prototype, four mutants each failed the test meant to catch them:
  - `retapped` skipping deletes fails "sends a held delete again".
  - `sendingState` keeping a held control fails "lets it go when another control…" and "holds one failed control…".
  - `failureNote` always offering Try again fails the tie test and the sign-in note.
  - The diaper form renewing its actionId, which is CodeRabbit's suggestion, fails "a diaper changed after its first send landed unanswered…", because a second diaper is saved.
  - Commands: `pnpm exec vitest run apps/web/test/retap.test.ts apps/web/test/sheets-state.test.ts apps/web/test/failure.test.ts` and `pnpm exec playwright test --config .superpowers/e2e.config.ts first-tap held-failures`. Expected: PASS.
- [ ] **Step 3: Write the code.** `git checkout c66db8f -- apps/web/src/sheets/failure.ts`:

```diff
--- a/apps/web/src/sheets/failure.ts
+++ b/apps/web/src/sheets/failure.ts
@@ -14,6 +14,7 @@ import {
 import type { Action } from "../api/actions.ts"
 import { AuthRequired, Offline } from "../api/errors.ts"
 import { clockTime } from "../clock-time.ts"
+import { offersRetry } from "./held.ts"
 import { restoredNote } from "./restored-note.ts"
 import { editsARecord, type SheetKind } from "./sending.ts"
 
@@ -32,7 +33,7 @@ export interface Household {
 
 const TRY_AGAIN = "Try again"
 
-const note = (message: string, retry: string | null = null): Note => ({ message, retry, signIn: false })
+const note = (message: string): Note => ({ message, retry: null, signIn: false })
 
 export const nameOf = ({ caregivers }: Household, id: string) =>
   caregivers.find((caregiver) => caregiver.id === id)?.displayName ?? "The other phone"
@@ -162,7 +163,7 @@ const OFFLINE = {
   app: "No connection. Keep the app open, and try again once you're back online.",
 }
 
-const offlineNote = (keptOn: KeptOn): Note => note(OFFLINE[keptOn], TRY_AGAIN)
+const offlineNote = (keptOn: KeptOn): Note => note(OFFLINE[keptOn])
 
 const EDITED_GONE = "This was deleted since it opened."
 
@@ -173,7 +174,7 @@ const goneMessage = (sheet: SheetKind | undefined) => {
 
 const goneNote = (sheet: SheetKind | undefined): Note => note(goneMessage(sheet))
 
-export const failureNote = (error: Error, household: Household, { keptOn, sheet, action }: NoteOptions): Note => {
+const noteFor = (error: Error, household: Household, { keptOn, sheet, action }: NoteOptions): Note => {
   if (error instanceof Offline) return offlineNote(keptOn)
   if (error instanceof AuthRequired || error instanceof Unauthorized) {
     return { message: "Your sign-in has expired. Sign in, and this will be saved.", retry: null, signIn: true }
@@ -182,5 +183,10 @@ export const failureNote = (error: Error, household: Household, { keptOn, sheet,
   if (restored !== null) return restored
   if (error instanceof InvalidInput) return fieldNote(error, household, sheet)
   if (error instanceof NotFound) return goneNote(sheet)
-  return conflictNote(error, household, action) ?? note("Not saved.", TRY_AGAIN)
+  return conflictNote(error, household, action) ?? note("Not saved.")
+}
+
+export const failureNote = (error: Error, household: Household, options: NoteOptions): Note => {
+  const said = noteFor(error, household, options)
+  return said.retry === null && offersRetry(error) ? { ...said, retry: TRY_AGAIN } : said
 }
```

- [ ] **Step 4: Run them again.** The same commands, then `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add apps/web e2e`, then `git commit -m "From #93's deferred minors and CodeRabbit's notes there: failureNote takes its Try again from offersRetry instead of repeating the rule, and tests pin a held delete sent again, one failed nursing control held at a time, a paused feed's Finish offline, and a diaper changed after its first send landed unanswered meeting the household's already saved"`.

### Task 4: The docs

- [ ] **Step 1: Write them.** `git checkout d777133 -- docs/implementation-plan.md docs/runbooks/access.md`.
  - The M1.12 row gains: "**Decided 15 Oct 2026 (#92):** a failure that lands in its own sheet after the parent opened it again opens that sheet again on the failure, as one that finds it closed does, so its form takes the first tap's time and actionId and a second tap can't save a second entry. Anything typed into the sheet in those seconds is replaced."
  - The M5.4 row gains: "**Decided 15 Oct 2026 (#91):** a control asks to keep the app open too, since closing its sheet now asks before letting it go."
  - The M5.6 row gains: "**Decided 15 Oct 2026 (#91):** closing a sheet also asks before it lets go of a failed control that could still be saved as it is (Wake up, Finish, Pause, Switch, Resume, Nap or night, an edit or a delete), naming what would be lost and when it was tapped, as in "Discard the wake-up at 2:40 AM?". It's kept while the app is open, not across a reload."
  - The runbook:

```diff
--- a/docs/runbooks/access.md
+++ b/docs/runbooks/access.md
@@ -129,6 +129,7 @@ From the main checkout, run `git switch main`, `git pull --ff-only`, `pnpm insta
 When GitHub Actions can't run CI (an outage, or the month's minutes are spent, as on 15 October 2026), run `pnpm release --gates-local` instead, on Andrew's word (#96):
 - **What it changes:** it skips the question to GitHub and runs CI's own commands on the checkout, in ci.yml's order: `pnpm install --frozen-lockfile`, `pins:check`, `lint`, `typecheck`, `test`, `coverage`, `build`, `bundle:check`, then `e2e` in both engines.
 - **How they run:** with `CI=1`, as on GitHub, so E2E keeps its one retry and refuses a busy port 4173. A test ties the list to ci.yml's `run:` steps.
+- **Its browsers:** E2E needs Playwright's Chromium and WebKit. CI installs them on every run, but the release doesn't. After an install that moves Playwright's version, run `pnpm exec playwright install chromium webkit` first; otherwise the E2E gate fails and the release stops before it deploys.
 - **When one fails:** the release stops at the first command that fails and names it. Otherwise it goes on as usual: the clean checkout at `origin/main`, the build and its checks, the restore point, the upload, the deploy.
 - **Its record:** the deployment's message ends in `local gates`.
 - **How long:** expect several minutes, most of them E2E. Stop any `vite preview` on port 4173 first.
```

- [ ] **Step 2: Check them.** `pnpm lint` (oxfmt checks Markdown), and re-read the rows against the branch.
- [ ] **Step 3: Commit.** `git add docs`, then `git commit -m "Record #92 and #91 in the plan's M1.12, M5.4 and M5.6 rows, and say in the runbook that pnpm release --gates-local needs Playwright's browsers installed after Playwright's version moves (from CodeRabbit's note on #98)"`.

## Finish

- [ ] One fresh final review of the whole branch on Opus, briefed with the Review Focus and these 3 AM questions:
  - Can one tap still log two diapers, two wakes or two finishes, whichever order the sheet's opening, the send and its failure come in?
  - Can a failed wake, finish, pause, edit or delete still disappear without the parent saying so, by closing, by Add bottle, or by another sheet?
  - Is the parent ever asked about something that can't be saved anyway, or asked twice?
  - Does a different button after a failure still act at its own tap, with nothing stale resent?
  - Does the question say the right time, on the household's clock, for each control?
- [ ] Fix its findings in one wave, ruling on any it marks for Andrew.
- [ ] Merge `main` if it moved, then run ci.yml's commands here, since Actions has no minutes: `pnpm install --frozen-lockfile`, `pins:check`, `lint`, `typecheck`, `test`, `coverage`, `build`, `bundle:check`, and the whole E2E suite in both engines from `.superpowers/e2e.config.ts`.
- [ ] Push, and open the PR against `main`. Its description says `Closes #92` and `Closes #91`. It says that merging doesn't deploy this month: `pnpm release --gates-local` deploys it from the main checkout, on Andrew's word. It also says it changes no Worker, contract, receipt or migration, and it carries the gates' table. The device checklist after deploy, on one phone:
  - Airplane mode on. Sleep › Wake up, and see "No connection. Keep the app open, …". Swipe the sheet down: it asks "Discard the wake-up at …?". Tap Keep, turn airplane mode off, and tap Wake up again. Today says she woke at the first tap's time.
  - The same with a running feed's Pause, tapping Discard this time. The feed is still running, and nothing was sent.
- [ ] Answer CodeRabbit's notes on the merged PRs: on #93, why both are declined (the plan's AC 14, and the new replay-mismatch test); on #98, the runbook line.
- [ ] Comment on #92 at each step: plan approved, built, PR open, approved, merged and live.
- [ ] Iterate on CodeRabbit until it approves. No merge: Andrew merges.

## Handoffs (not GH-92 or GH-91 work)

Post each as a comment on its issue once the PR is open.
- **M5.2 (#47, accessibility):**
  - The discard question is now a sentence per control: "Discard the wake-up at 9:30 AM?", "Discard your changes?" and the like. It's still `role="alert"`, with Keep focused on arrival. Check how VoiceOver reads the time.
  - #92's reopen mounts the failure note in a sheet the parent opened again, which M5.2's rule focuses.
  - `KeptOn` lost `null`. `failure-note.tsx`'s keptOn line, now `keptOnFor(…)`, sits next to M5.2's `about` change.
- **#71 (splits):** `sheets-state.ts` grows from 141 to 169 lines (`landsInItsOwnSheet`, `asksFirst`, `goesOnAnotherSend`, `withoutReplaced`). Add it to the split's list.

## Unresolved questions

None block the build. P1–P13 are the plan's own calls, for veto. P2 (the measurement sheet) and P5 (Add bottle) are the two that go beyond the grill's words.

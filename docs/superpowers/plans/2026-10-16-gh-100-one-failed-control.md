# GH-100 One Failed Control per Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, chosen by Andrew on 16 Oct 2026) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (issue #100):** a failed Pause, Wake up or other control that could still be saved is never lost without a question when the parent does something else on its sheet.
- **One failed control per sheet:** while one is held, any other change on that sheet first asks "Discard the pause at 2:40 AM?". Keep sends nothing, and Discard lets the failure go and sends the change. A control that replaces it (Switch, Pause, Resume, Finish, Wake up, or a delete of the same record) still does so without asking, as #75 decided.
- **"Could still be saved" covers more:** it now includes a failed control whose conflict offers "… anyway", which saves the first tap's time. So closing the sheet, Back on the finish step, or another change asks first there too. OK still accepts the household's copy.

**Why not keep both failures (v1):** this replaces the first design ("keep a failed control held across an edit"). Its Opus final review showed that two failures on one sheet bring the issue's harm back:
- every own button, the note, Try again, the question and Sign in act on the *first* held failure
- a failed edit ahead of a failed Pause makes the Pause button send a fresh tap that drops the first one

Andrew chose this design instead (16 Oct 2026). v1's branch is kept as `scratch/gh-100-v1-feature` for the record.

**Architecture** (`apps/web/src/sheets/`, Node tests):
- **`saveable.ts` (new):** `stillSaveable(failed)` is true when the failure's note offers Try again or Sign in (`savesAsItIs`), or the sheet offers "… anyway".
  - On an edit sheet, that's a `STALE_VERSION` conflict whose record still exists, as `StaleNote` offers "Save mine anyway".
  - Elsewhere, it's the redo `recoveryOf` offers. That's now `redoOf` in `recovery.ts`, with `recoveryOf = redoOf ?? replayOf`.
  - A test ties `stillSaveable` to what the sheet shows for every kind of failure.
- **`isEntry` moves to `sending.ts`,** so `sheets-state.ts` can use `recovery.ts` without an import cycle. `kept.ts`, `kept-on.ts`, `restored.ts` and `recovery.ts` import it from there.
- **`sheets-state.ts`:**
  - `asksFirst` uses `stillSaveable` for controls.
  - `blockerFor(state, send)` names the held control that another send would leave beside a second failure. That's a control on the send's own opening that could still be saved, isn't a "Save my changes" recovery (`closesOnSave`) and isn't replaced by the send.
    - A send replaces it when both act on the same record and the send is a delete, or both are steps (`switchSide`, `pauseFeed`, `resumeFeed`, `finishFeed`, `wakeSleep`).
    - A resend of a held failure is never blocked.
  - `askedBeforeSending` holds the send as `pending`, with its blocker. `discardedState` with a pending send lets the blocker go without closing the sheet, `keptState` forgets the send, and `dismissedState` forgets it and asks about the failure instead.
  - `failedState` puts a failed step or entry ahead of a failed edit on its opening (`heldWith`), for two sends that were already on their way.
- **`sheets-provider.tsx`:** `send` checks `blockerFor` first. On Discard, a pending send goes out (`deliver`). `sheet.tsx` asks about the blocker (`sheets.pending.blocker`).
- **`nursing-session.ts`:** the finish step's Back asks on `stillSaveable` (#99's `backAsksFirst`).

**Spec:** issue #100, its body and the comments "Andrew's calls (16 Oct 2026)" and "Andrew's calls after the review (16 Oct 2026)"; #99's plan; #75's rule that a different button acts at its own tap.

## Global Constraints

- **Where to work:** `.claude/worktrees/gh-92-held-failures`, on `fix/a-failed-pause-or-wake-up-is-still-dropped-without-asking-when-another-change-on-its-sheet-is-sent-so-its-time-can-be-lost.GH-100`, cut from `main` at `320c495` (#99 and #101, live since 13:06 UTC). Never the main checkout. The branch has no upstream: push with `git push -u origin HEAD`.
- **Tracking:** issue #100. The PR says `Closes #100`.
- **Peers:**
  - **91 holds M5.2 (#47).** Its branch also changes `sheet.tsx`, `sheets-context.ts` and `sheets-provider.tsx` (focus), in other hunks. Whoever merges second resolves.
  - **4b holds #80 + #77.**
- **CI:** Actions has no minutes until about 1 Nov 2026. Run ci.yml's commands on the Mac and paste them in the PR. Merging doesn't deploy: `pnpm release --gates-local` does, on Andrew's word.
- **Running commands:** `env PATH=/Users/andamonium/.nvm/versions/node/v24.21.0/bin:/Users/andamonium/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm …`, one command at a time.
- **Taking files:** from `scratch/gh-100-v2-replay`, which starts from `320c495`: Task 1 `c6420f0`, Task 2 `e7dfac8`, Task 3 `dbda2eb`. Use `git checkout <sha> -- <path>`, tests first.
- **E2E:** name specs by path, since this worktree's path contains "held-failures". Use `pnpm exec playwright test --config .superpowers/e2e.config.ts e2e/held-failures.spec.ts` (port 4240). Since #101, going offline refuses played answers, and `page.clock` floors `Date.now()`.
- **Lint:** no comments of any kind, no type assertions except `as const`, no non-null `!`, complexity at most 10.
- **Out of scope:**
  - keeping a failed control across a reload
  - a resend's version after the parent's own change, which Andrew declined: "Pause anyway" covers it
  - focus (M5.2)
  - `sheets-state.ts`'s length (#71)

## Decisions this plan makes (veto in review)

- **P1: "A conflict that offers … anyway" is read from the same functions that draw the button** (`redoOf`, and the edit sheets' stale rule). A conflict nothing would save still goes without asking: a feed finished meanwhile, a sleep already woken, a record deleted. The tie test holds the two together.
- **P2: Any send that would leave a second failure asks,** not only an edit. That includes a step after a failed edit (Pause after a failed start change) and a Start after a failed edit. That's what "one failed control per sheet" requires.
- **P3: What doesn't ask:**
  - a held entry, which keeps its own rule (M5.6)
  - a "Save my changes" recovery, which goes with its sheet's next send, as before
  - a send from another sheet (Add bottle opens the Bottle sheet)
  - a resend of the held failure itself
- **P4: Closing while the question is up** forgets the held send and asks about the failure, as closing does.
- **P5: Two sends already on their way** can still both fail. The failed step or entry is then put first, so the sheet's own buttons, the note and Try again act on it.
- **P6: A delete replaces any failed control on its own record,** as Andrew named for feeds and sleeps. But a feed's delete doesn't replace a failed start change, which carries the segment's id, so it asks first.
- **P7: The docs:**
  - the M5.6 row gains "Decided 16 Oct 2026 (#100)"
  - #99's three "Decided 15 Oct 2026" sentences get their full stops

## Review Focus

Andrew has ruled that any path that still loses a failed control's time without a question, or logs a second entry, is Important, whatever its label. Check every path explicitly:

1. **A second failure on one sheet.** The send paths through `send` → `blockerFor` (edit, step, delete, Start, the bottle sheet), the resends (Try again, `retapped`, the redo buttons), and the race of two sends in flight (`heldWith`).
   - Pinned by "asks first when another send would leave a second failure" (4 rows), "lets it through without asking" (5 rows), the Save-my-changes row, the ordering row, and the three E2E flows.
2. **A conflict let go without a question while "… anyway" would save it.** Pinned by `saveable.test.ts` (12 cases, each also tied to what the sheet offers), the dismissal row, Back's row, and the "Pause anyway" E2E.
3. **A question about something that can't be saved.** Pinned by the false rows of `saveable.test.ts`, and "a conflict nothing would save" lets the send through.
4. **The held send:**
   - Keep must send nothing.
   - Discard must send it once.
   - Closing must forget it.
   - Pinned by the three pending rows and the Keep and Discard E2E flows.

## Setup

- [ ] **Step 1: Check the branch.** `git log --oneline -1` shows this plan's commit on `320c495`. Fetch, and merge `origin/main` if it moved.
- [ ] **Step 2: Take the baseline.** `pnpm test`. On `320c495` this was 3,929 tests in 234 files. The tasks add 39 tests and one file (`saveable.test.ts`), for 3,968 in 235.

---

### Task 1: A failed control whose conflict offers "… anyway" can still be saved

**Files:**
- Create: `apps/web/src/sheets/saveable.ts`
- Modify: `apps/web/src/sheets/sending.ts`, `sheets-state.ts`, `recovery.ts`, `kept.ts`, `kept-on.ts`, `restored.ts`, `apps/web/src/features/feed/nursing-session.ts`
- Test: create `apps/web/test/saveable.test.ts`; modify `apps/web/test/sheets-state.test.ts`, `apps/web/test/nursing-session.test.ts`, `e2e/held-failures.spec.ts`

- [ ] **Step 1: Write the failing tests.** `git checkout c6420f0 -- apps/web/test/saveable.test.ts apps/web/test/sheets-state.test.ts apps/web/test/nursing-session.test.ts e2e/held-failures.spec.ts`:

`apps/web/test/saveable.test.ts` (new):

```ts
import { DiaperConflict, FeedConflict, InvalidInput, NotFound, SleepConflict, Unauthorized } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline } from "../src/api/errors.ts"
import { recordOf } from "../src/api/today-change.ts"
import { staleOf } from "../src/features/edit/stale.ts"
import { offersRetry } from "../src/sheets/held.ts"
import { recoveryOf } from "../src/sheets/recovery.ts"
import { stillSaveable } from "../src/sheets/saveable.ts"
import { editsARecord, type Failed, type Sending } from "../src/sheets/sending.ts"
import { diaperAt, feedAt, NOW, sleptAt } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const TAPPED = NOW - 60_000

const PAUSE: Sending = {
  sheet: "nursing",
  action: { kind: "pauseFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED } },
}

const WAKE: Sending = {
  sheet: "sleep",
  action: { kind: "wakeSleep", id: "sleep-1", payload: { actionId: ACTION_ID, version: 1, occurredAt: TAPPED } },
}

const DIAPER_EDIT: Sending = {
  sheet: "editDiaper",
  action: {
    kind: "editDiaper",
    id: "diaper-1",
    payload: { actionId: ACTION_ID, version: 2, occurredAt: TAPPED, wet: false, dirty: true },
  },
}

const RUNNING = feedAt(NOW - 600_000, {
  id: "feed-1",
  status: "active",
  endedAt: null,
  version: 4,
  segments: [{ id: "segment-1", side: "left", startedAt: NOW - 600_000, endedAt: null }],
})
const FINISHED = feedAt(NOW - 600_000, { id: "feed-1", status: "completed", version: 4 })
const ASLEEP = sleptAt(NOW - 3_600_000, { id: "sleep-1", endedAt: null, version: 2 })
const WOKEN = sleptAt(NOW - 3_600_000, { id: "sleep-1", endedAt: NOW - 30_000, version: 2 })

const CASES: ReadonlyArray<readonly [string, Failed, boolean]> = [
  ["a pause with no connection", { sending: PAUSE, error: new Offline() }, true],
  ["a pause not saved for another reason", { sending: PAUSE, error: new Error("Not saved") }, true],
  ["a pause waiting on a sign-in", { sending: PAUSE, error: new AuthRequired() }, true],
  ["a pause after a refused sign-in", { sending: PAUSE, error: new Unauthorized() }, true],
  [
    "a pause the other change still fits, which Pause anyway saves",
    { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current: RUNNING }) },
    true,
  ],
  [
    "a pause on a feed finished meanwhile, which nothing would save",
    { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current: FINISHED }) },
    false,
  ],
  [
    "a wake on a sleep still running, which Wake anyway saves",
    { sending: WAKE, error: new SleepConflict({ code: "STALE_VERSION", current: ASLEEP }) },
    true,
  ],
  [
    "a wake on a sleep already woken",
    { sending: WAKE, error: new SleepConflict({ code: "STALE_VERSION", current: WOKEN }) },
    false,
  ],
  [
    "an edit sheet's change after the other phone's, which Save mine anyway saves",
    {
      sending: DIAPER_EDIT,
      error: new DiaperConflict({ code: "STALE_VERSION", current: diaperAt(NOW, { id: "diaper-1", version: 3 }) }),
    },
    true,
  ],
  [
    "an edit sheet's change to a diaper deleted meanwhile",
    {
      sending: DIAPER_EDIT,
      error: new DiaperConflict({
        code: "STALE_VERSION",
        current: diaperAt(NOW, { id: "diaper-1", version: 3, deletedAt: NOW }),
      }),
    },
    false,
  ],
  [
    "a time the household refused",
    { sending: PAUSE, error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "in_future" }] }) },
    false,
  ],
  ["a record that's gone", { sending: PAUSE, error: new NotFound() }, false],
]

const offeredOnTheSheet = (failed: Failed) => {
  if (offersRetry(failed.error) || failed.error instanceof AuthRequired || failed.error instanceof Unauthorized) {
    return true
  }
  if (editsARecord(failed.sending.sheet)) {
    const stale = staleOf(failed)
    return stale !== null && recordOf(stale.current).deletedAt === null
  }
  return recoveryOf(failed)?.label.endsWith("anyway") ?? false
}

describe("stillSaveable", () => {
  it.each(CASES)("knows whether it could still be saved: %s", (_label, failed, saveable) => {
    expect(stillSaveable(failed)).toBe(saveable)
  })

  it.each(CASES)("agrees with what the sheet offers to save it with: %s", (_label, failed) => {
    expect(stillSaveable(failed)).toBe(offeredOnTheSheet(failed))
  })
})
```

`apps/web/test/sheets-state.test.ts`:

```diff
--- a/apps/web/test/sheets-state.test.ts
+++ b/apps/web/test/sheets-state.test.ts
@@ -3,14 +3,13 @@ import { describe, expect, it } from "vitest"
 import type { Action } from "../src/api/actions.ts"
 import { AuthRequired, Offline } from "../src/api/errors.ts"
 import { heldFor } from "../src/sheets/held.ts"
-import { closesOnSend, type Failed, type Sending } from "../src/sheets/sending.ts"
+import { closesOnSend, type Failed, isEntry, type Sending } from "../src/sheets/sending.ts"
 import {
   CLOSED,
   discardedState,
   dismissedState,
   expiredState,
   failedState,
-  isEntry,
   reopenedState,
   restoredState,
   shownState,
@@ -704,6 +703,18 @@ describe("closing a sheet that holds a failed control", () => {
     expect(dismissedState(shownWith(failed))).toMatchObject({ open: null, asking: false, held: [] })
   })
 
+  it("asks before letting go of a conflict that Pause anyway would still save", () => {
+    const current = feedAt(NOW - 600_000, {
+      id: "feed-1",
+      status: "active",
+      endedAt: null,
+      version: 4,
+      segments: [{ id: "segment-1", side: "left", startedAt: NOW - 600_000, endedAt: null }],
+    })
+    const failed = { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current }) }
+    expect(dismissedState(shownWith(failed))).toMatchObject({ open: "nursing", asking: true, held: [failed] })
+  })
+
   it("lets it go once the parent discards it", () => {
     const failed = { sending: WOKE, error: new Offline() }
     const asking = dismissedState(shownWith(failed))
```

`apps/web/test/nursing-session.test.ts`:

```diff
--- a/apps/web/test/nursing-session.test.ts
+++ b/apps/web/test/nursing-session.test.ts
@@ -152,13 +152,17 @@ describe("finishingAfter", () => {
 })
 
 describe("backAsksFirst", () => {
-  it("asks before Back lets go of a finish that could still be saved as it is", () => {
+  it("asks before Back lets go of a finish that could still be saved, by Try again or Finish anyway", () => {
     expect(backAsksFirst(failedWith(FINISH))).toBe(true)
     expect(backAsksFirst(failedWith(FINISH, new Error("Not saved")))).toBe(true)
+    expect(backAsksFirst(failedWith(FINISH, STALE))).toBe(true)
   })
 
-  it("lets Back go without asking after a finish that can't be saved as it is, or anything else", () => {
-    expect(backAsksFirst(failedWith(FINISH, STALE))).toBe(false)
+  it("lets Back go without asking after a finish that nothing would save, or anything else", () => {
+    const finished = { ...HOUSEHOLD_COPY, status: "completed" as const, endedAt: STOPPED_AT }
+    expect(backAsksFirst(failedWith(FINISH, new FeedConflict({ code: "STALE_VERSION", current: finished })))).toBe(
+      false,
+    )
     expect(backAsksFirst(failedWith(FINISH, EMPTY))).toBe(false)
     expect(backAsksFirst(failedWith(SWITCH))).toBe(false)
     expect(backAsksFirst(null)).toBe(false)
```

`e2e/held-failures.spec.ts`:

```diff
--- a/e2e/held-failures.spec.ts
+++ b/e2e/held-failures.spec.ts
@@ -161,3 +161,34 @@ test("a diaper changed after its first send landed unanswered keeps that send's
   expect(sent[1]?.dirty).toBe(true)
   expect(answered).toEqual([201, 409])
 })
+
+test("a pause whose resend meets a change Pause anyway would still save asks before closing drops it", async ({
+  page,
+}) => {
+  const { andrew, emily } = await caregiversOf(page)
+  const feed = runningFeed(andrew.id, STARTED, "left")
+  await playHousehold(page, todayWith(feed))
+  const theirs = { ...feed, version: 2, updatedBy: emily.id }
+  const sent: Array<{ readonly actionId?: string; readonly version?: number; readonly occurredAt?: number }> = []
+  await page.route("**/api/feeds/feed-1/pause", async (route) => {
+    sent.push(route.request().postDataJSON())
+    if (sent.length === 1) return route.abort("internetdisconnected")
+    if (sent.length === 2) {
+      return route.fulfill({ status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } })
+    }
+    return route.fulfill({ status: 200, json: { feed: { ...theirs, version: 3 }, changed: [["today"]] } })
+  })
+  await openToday(page)
+  await page.clock.setFixedTime(FIRST_TAP)
+  const sheet = await openSheet(page, "Nursing")
+  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  await sheet.getByRole("button", { name: "Try again" }).click()
+  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this feed a moment ago.`)
+  await page.keyboard.press("Escape")
+  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
+  await sheet.getByRole("button", { name: "Keep" }).click()
+  await sheet.getByRole("button", { name: "Pause anyway" }).click()
+  await expect.poll(() => sent.length).toBe(3)
+  expect(sent[2]).toMatchObject({ actionId: sent[0]?.actionId, version: 2, occurredAt: FIRST_TAP })
+})
```

- [ ] **Step 2: Run them to see them fail.**
  - **Unit:** `pnpm exec vitest run apps/web/test/saveable.test.ts apps/web/test/sheets-state.test.ts apps/web/test/nursing-session.test.ts`. Expected: FAIL.
    - `saveable.test.ts` can't load `saveable.ts`.
    - Two behaviour tests fail: "asks before Back lets go of a finish that could still be saved, by Try again or Finish anyway" and "asks before letting go of a conflict that Pause anyway would still save".
    - The 31 "a new entry" rows fail only because the test now imports `isEntry` from `sending.ts`, which doesn't export it yet.
  - **E2E:** `pnpm exec playwright test --config .superpowers/e2e.config.ts e2e/held-failures.spec.ts`. Expected: FAIL, 2 of 12 runs. The "Pause anyway" case fails in both engines, because closing drops the conflict without asking.
- [ ] **Step 3: Write the code.** `git checkout c6420f0 -- apps/web/src/sheets/saveable.ts apps/web/src/sheets/sending.ts apps/web/src/sheets/sheets-state.ts apps/web/src/sheets/recovery.ts apps/web/src/sheets/kept.ts apps/web/src/sheets/kept-on.ts apps/web/src/sheets/restored.ts apps/web/src/features/feed/nursing-session.ts`:

`apps/web/src/sheets/saveable.ts` (new):

```ts
import { DiaperConflict, DoseConflict, FeedConflict, SleepConflict } from "@bt/contracts"
import { savesAsItIs } from "./held.ts"
import { redoOf } from "./recovery.ts"
import { editsARecord, type Failed } from "./sending.ts"

const staleButStillThere = (error: Error) =>
  (error instanceof DiaperConflict ||
    error instanceof FeedConflict ||
    error instanceof SleepConflict ||
    error instanceof DoseConflict) &&
  error.code === "STALE_VERSION" &&
  error.current.deletedAt === null

const offersAnyway = (failed: Failed) =>
  editsARecord(failed.sending.sheet) ? staleButStillThere(failed.error) : redoOf(failed) !== null

export const stillSaveable = (failed: Failed) => savesAsItIs(failed.error) || offersAnyway(failed)
```

`apps/web/src/sheets/recovery.ts`:

```diff
--- a/apps/web/src/sheets/recovery.ts
+++ b/apps/web/src/sheets/recovery.ts
@@ -2,8 +2,7 @@ import { DiaperConflict, FeedConflict, MeasurementConflict, SleepConflict } from
 import { isConflict } from "./held.ts"
 import { joined, mineAnyway, redone, redoneSleep } from "./redo.ts"
 import { diaperEdit, feedReplay, measurementReplay, sleepReplay } from "./save-changes.ts"
-import type { Failed, Recovery, Sending } from "./sending.ts"
-import { isEntry } from "./sheets-state.ts"
+import { type Failed, isEntry, type Recovery, type Sending } from "./sending.ts"
 
 const SETTLED_BY_OK = new Set([
   "STALE_VERSION",
@@ -12,36 +11,32 @@ const SETTLED_BY_OK = new Set([
   "ACTION_REPLAY_MISMATCH",
 ])
 
+export const redoOf = ({ sending, error }: Failed): Recovery | null => {
+  if (error instanceof SleepConflict && error.code === "STALE_VERSION") return redoneSleep(sending, error.current)
+  if (error instanceof FeedConflict && error.code === "STALE_VERSION") return redone(sending, error.current)
+  if (error instanceof MeasurementConflict && error.code !== "ACTION_REPLAY_MISMATCH")
+    return mineAnyway(sending, error.current)
+  return null
+}
+
 const feedRecovery = (sending: Sending, error: FeedConflict): Recovery | null => {
-  switch (error.code) {
-    case "STALE_VERSION":
-      return redone(sending, error.current)
-    case "FEED_ALREADY_ACTIVE":
-      return joined(sending, error.current)
-    case "ACTION_REPLAY_MISMATCH":
-      return feedReplay(sending, error.current)
-    default:
-      return null
-  }
+  if (error.code === "FEED_ALREADY_ACTIVE") return joined(sending, error.current)
+  return error.code === "ACTION_REPLAY_MISMATCH" ? feedReplay(sending, error.current) : null
 }
 
-const measurementRecovery = (sending: Sending, { code, current }: MeasurementConflict): Recovery | null =>
-  code === "ACTION_REPLAY_MISMATCH" ? measurementReplay(sending, current) : mineAnyway(sending, current)
-
-const sleepRecovery = (sending: Sending, { code, current }: SleepConflict): Recovery | null => {
-  if (code === "STALE_VERSION") return redoneSleep(sending, current)
-  return code === "ACTION_REPLAY_MISMATCH" ? sleepReplay(sending, current) : null
-}
-
-export const recoveryOf = ({ sending, error }: Failed): Recovery | null => {
-  if (error instanceof SleepConflict) return sleepRecovery(sending, error)
+const replayOf = ({ sending, error }: Failed): Recovery | null => {
+  if (error instanceof SleepConflict && error.code === "ACTION_REPLAY_MISMATCH")
+    return sleepReplay(sending, error.current)
   if (error instanceof FeedConflict) return feedRecovery(sending, error)
-  if (error instanceof MeasurementConflict) return measurementRecovery(sending, error)
+  if (error instanceof MeasurementConflict && error.code === "ACTION_REPLAY_MISMATCH")
+    return measurementReplay(sending, error.current)
   if (error instanceof DiaperConflict && error.code === "ACTION_REPLAY_MISMATCH")
     return diaperEdit(sending, error.current)
   return null
 }
 
+export const recoveryOf = (failed: Failed): Recovery | null => redoOf(failed) ?? replayOf(failed)
+
 export const offersOk = ({ sending, error }: Failed) =>
   isConflict(error) &&
   "code" in error &&
```

`apps/web/src/sheets/sending.ts`:

```diff
--- a/apps/web/src/sheets/sending.ts
+++ b/apps/web/src/sheets/sending.ts
@@ -77,3 +77,16 @@ export const closesOnSend = (sending: Sending) =>
 
 export const closesOnSave = (sending: Sending) =>
   (!editsARecord(sending.sheet) && CLOSES_ON_SAVE.has(sending.action.kind)) || savesAPastSleep(sending)
+
+const NEW_ENTRIES = new Set<Action["kind"]>([
+  "logDiaper",
+  "logFeed",
+  "startFeed",
+  "addBottle",
+  "logMeasurement",
+  "logSleep",
+  "startSleep",
+  "logDose",
+])
+
+export const isEntry = ({ action }: Sending) => NEW_ENTRIES.has(action.kind)
```

`apps/web/src/sheets/sheets-state.ts`:

```diff
--- a/apps/web/src/sheets/sheets-state.ts
+++ b/apps/web/src/sheets/sheets-state.ts
@@ -1,19 +1,12 @@
-import type { Action } from "../api/actions.ts"
 import type { Saved } from "../api/send.ts"
-import {
-  actionIdOf,
-  editingOf,
-  heldFor,
-  isOnOpening,
-  savesAsItIs,
-  settlesWithoutAsking,
-  withoutAction,
-} from "./held.ts"
+import { actionIdOf, editingOf, heldFor, isOnOpening, settlesWithoutAsking, withoutAction } from "./held.ts"
+import { stillSaveable } from "./saveable.ts"
 import {
   addsOrEdits,
   closesOnSave,
   closesOnSend,
   type Failed,
+  isEntry,
   isUndo,
   type Sending,
   type SheetKind,
@@ -44,20 +37,8 @@ export const CLOSED: SheetsState = {
   queued: false,
 }
 
-const NEW_ENTRIES = new Set<Action["kind"]>([
-  "logDiaper",
-  "logFeed",
-  "startFeed",
-  "addBottle",
-  "logMeasurement",
-  "logSleep",
-  "startSleep",
-  "logDose",
-])
-
-export const isEntry = ({ action }: Sending) => NEW_ENTRIES.has(action.kind)
-
-const asksFirst = ({ sending, error }: Failed) => (isEntry(sending) ? !settlesWithoutAsking(error) : savesAsItIs(error))
+const asksFirst = (failed: Failed) =>
+  isEntry(failed.sending) ? !settlesWithoutAsking(failed.error) : stillSaveable(failed)
 
 const goesOnAnotherSend = ({ sending, error }: Failed) => !isEntry(sending) || settlesWithoutAsking(error)
 
```

`apps/web/src/features/feed/nursing-session.ts`:

```diff
--- a/apps/web/src/features/feed/nursing-session.ts
+++ b/apps/web/src/features/feed/nursing-session.ts
@@ -1,5 +1,5 @@
 import { FeedConflict } from "@bt/contracts"
-import { savesAsItIs } from "../../sheets/held.ts"
+import { stillSaveable } from "../../sheets/saveable.ts"
 import type { Failed } from "../../sheets/sending.ts"
 import { NOW, type Resolved, resolveSent, type When, whenAt } from "../../sheets/when.ts"
 
@@ -48,4 +48,4 @@ export const emptiedBy = (failed: Failed | null) => {
 export const finishingAfter = (failed: Failed | null): failed is Failed => failed?.sending.action.kind === "finishFeed"
 
 export const backAsksFirst = (failed: Failed | null): failed is Failed =>
-  finishingAfter(failed) && savesAsItIs(failed.error)
+  finishingAfter(failed) && stillSaveable(failed)
```

`kept.ts`, `kept-on.ts` and `restored.ts` only change where `isEntry` comes from.

- [ ] **Step 4: Run them to see them pass.** The same commands. Expected: PASS. Then `pnpm test`, `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 5: Commit.** `git add apps/web e2e/held-failures.spec.ts`, then `git commit -m "A failed control whose conflict offers … anyway can still be saved, so closing the sheet, or Back on the finish step, asks before letting it go, as for one with no connection. stillSaveable reads the same redo the sheet offers (redoOf), and isEntry moves to sending.ts so the sheets reducer can use it without an import cycle (#100)"`.

### Task 2: One failed control per sheet

**Files:**
- Modify: `apps/web/src/sheets/sheets-state.ts`, `sheets-provider.tsx`, `sheets-context.ts`, `sheet.tsx`
- Test: modify `apps/web/test/sheets-state.test.ts`, `e2e/held-failures.spec.ts`

- [ ] **Step 1: Write the failing tests.** `git checkout e7dfac8 -- apps/web/test/sheets-state.test.ts e2e/held-failures.spec.ts`:

`apps/web/test/sheets-state.test.ts`:

```diff
--- a/apps/web/test/sheets-state.test.ts
+++ b/apps/web/test/sheets-state.test.ts
@@ -5,11 +5,14 @@ import { AuthRequired, Offline } from "../src/api/errors.ts"
 import { heldFor } from "../src/sheets/held.ts"
 import { closesOnSend, type Failed, isEntry, type Sending } from "../src/sheets/sending.ts"
 import {
+  askedBeforeSending,
+  blockerFor,
   CLOSED,
   discardedState,
   dismissedState,
   expiredState,
   failedState,
+  keptState,
   reopenedState,
   restoredState,
   shownState,
@@ -746,3 +749,120 @@ describe("closing a sheet that holds a failed control", () => {
     expect(heldFor(state.held, "nursing")).toBe(switched)
   })
 })
+
+describe("one failed control per sheet", () => {
+  const paused = { sending: PAUSE, error: new Offline() }
+  const woke = { sending: WOKE, error: new Offline() }
+  const running = feedAt(NOW - 600_000, {
+    id: "feed-1",
+    status: "active",
+    endedAt: null,
+    version: 4,
+    segments: [{ id: "segment-1", side: "left", startedAt: NOW - 600_000, endedAt: null }],
+  })
+
+  const START_CHANGED: Sending = {
+    sheet: "nursing",
+    action: {
+      kind: "editSegment",
+      id: "segment-1",
+      payload: { actionId: RENEWED, version: 3, side: "left", startedAt: NOW - 900_000, endedAt: null },
+    },
+  }
+  const NIGHT: Sending = {
+    sheet: "sleep",
+    action: {
+      kind: "editSleep",
+      id: "sleep-1",
+      payload: { actionId: RENEWED, version: 1, kind: "night", startedAt: NOW - 3_600_000, endedAt: null },
+    },
+  }
+  const SWITCHED_AFTER: Sending = {
+    sheet: "nursing",
+    action: {
+      kind: "switchSide",
+      id: "feed-1",
+      payload: { actionId: "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d", version: 3, occurredAt: NOW },
+    },
+  }
+  const ANOTHER_BOTTLE: Sending = {
+    sheet: "bottle",
+    action: {
+      kind: "addBottle",
+      id: "feed-1",
+      payload: { actionId: RENEWED, version: 3, occurredAt: NOW, breastMilkMl: 40, formulaMl: 0 },
+    },
+  }
+
+  const holding = (failed: Failed) => failedState(CLOSED, failed, NOW)
+
+  it.each([
+    { label: "a pause, before its feed's start is changed", failed: paused, fresh: START_CHANGED },
+    { label: "a wake, before Nap or night is changed", failed: woke, fresh: NIGHT },
+    {
+      label: "a pause whose conflict Pause anyway would still save",
+      failed: { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current: running }) },
+      fresh: START_CHANGED,
+    },
+    {
+      label: "a failed start change, before the feed is switched",
+      failed: { sending: START_CHANGED, error: new Offline() },
+      fresh: SWITCHED_AFTER,
+    },
+  ])("asks first when another send would leave a second failure: $label", ({ failed, fresh }) => {
+    expect(blockerFor(holding(failed), fresh)).toBe(failed)
+  })
+
+  it.each([
+    { label: "a send that replaces it, Switch after a pause", failed: paused, fresh: SWITCHED_AFTER },
+    { label: "its own resend", failed: paused, fresh: PAUSE },
+    { label: "a send from another sheet", failed: paused, fresh: ANOTHER_BOTTLE },
+    {
+      label: "a conflict nothing would save",
+      failed: { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current: feedAt(NOW) }) },
+      fresh: START_CHANGED,
+    },
+    {
+      label: "a held entry, which keeps its own rule",
+      failed: { sending: DIAPER, error: new Offline() },
+      fresh: OTHER_DIAPER,
+    },
+  ])("lets it through without asking: $label", ({ failed, fresh }) => {
+    expect(blockerFor(holding(failed), fresh)).toBeNull()
+  })
+
+  it("lets a diaper's Save my changes go with its form's next tap, without asking", () => {
+    const failed = { sending: EDIT_DIAPER, error: new Offline() }
+    const saving = sendingState(shownState(CLOSED, "diaper"), EDIT_DIAPER, true)
+    const failedThere = failedState(saving, failed, NOW)
+    expect(failedThere.held).toEqual([failed])
+    expect(blockerFor(failedThere, DIAPER)).toBeNull()
+  })
+
+  it("holds the send behind the question until the parent answers", () => {
+    const asking = askedBeforeSending(holding(paused), START_CHANGED, paused)
+    expect(asking).toMatchObject({
+      open: "nursing",
+      asking: true,
+      pending: { sending: START_CHANGED, blocker: paused },
+    })
+    expect(keptState(asking)).toMatchObject({ open: "nursing", asking: false, pending: null, held: [paused] })
+  })
+
+  it("lets the failure go on Discard and keeps the sheet open, so the held send can go out", () => {
+    const asking = askedBeforeSending(holding(paused), START_CHANGED, paused)
+    expect(discardedState(asking, paused)).toMatchObject({ open: "nursing", asking: false, pending: null, held: [] })
+  })
+
+  it("forgets the held send when the parent closes the sheet instead, and asks about the failure", () => {
+    const asking = askedBeforeSending(holding(paused), START_CHANGED, paused)
+    expect(dismissedState(asking)).toMatchObject({ open: "nursing", asking: true, pending: null })
+  })
+
+  it("puts a failed control ahead of a failed edit on its sheet, so its own buttons act on it first", () => {
+    const edited = { sending: START_CHANGED, error: new Offline() }
+    const both = failedState(holding(edited), paused, NOW)
+    expect(both.held).toEqual([paused, edited])
+    expect(heldFor(both.held, "nursing")).toBe(paused)
+  })
+})
```

`e2e/held-failures.spec.ts`:

```diff
--- a/e2e/held-failures.spec.ts
+++ b/e2e/held-failures.spec.ts
@@ -162,6 +162,78 @@ test("a diaper changed after its first send landed unanswered keeps that send's
   expect(answered).toEqual([201, 409])
 })
 
+const failPauseThenChangeStart = async (page: Page) => {
+  const { andrew } = await caregiversOf(page)
+  const feed = runningFeed(andrew.id, STARTED, "left")
+  const { played, answer } = await playHousehold(page, todayWith(feed))
+  await answer("**/api/segments/segment-1", () => ({
+    status: 200,
+    json: { feed: { ...feed, version: 2 }, changed: [["today"]] },
+  }))
+  const paused = await loseSaves(page, "**/api/feeds/feed-1/pause", {
+    lost: 1,
+    until: Promise.resolve(),
+    answer: () => ({ feed: { ...feed, version: 2 }, changed: [["today"]] }),
+  })
+  await openToday(page)
+  await page.clock.setFixedTime(FIRST_TAP)
+  const sheet = await openSheet(page, "Nursing")
+  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  await sheet.getByRole("button", { name: "Change" }).click()
+  await sheet.getByLabel("Started").fill("2026-10-09T08:45")
+  await sheet.getByRole("button", { name: "Save start" }).click()
+  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
+  return { sheet, played, paused }
+}
+
+test("a failed pause asks before its feed's start is changed, and Keep sends nothing, so Try again saves the first tap's time", async ({
+  page,
+}) => {
+  const { sheet, played, paused } = await failPauseThenChangeStart(page)
+  await sheet.getByRole("button", { name: "Keep" }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  expect(played.sent).toEqual([])
+  await sheet.getByRole("button", { name: "Try again" }).click()
+  await expect.poll(() => paused.length).toBe(2)
+  expect(paused[1]?.actionId).toBe(paused[0]?.actionId)
+  expect(paused[1]?.occurredAt).toBe(FIRST_TAP)
+})
+
+test("a failed pause's Discard lets it go and sends the start change", async ({ page }) => {
+  const { sheet, played, paused } = await failPauseThenChangeStart(page)
+  await sheet.getByRole("button", { name: "Discard" }).click()
+  await expect.poll(() => played.sent.length).toBe(1)
+  expect(played.sent[0]?.path).toBe("/api/segments/segment-1")
+  await expect(sheet.getByRole("alert")).toHaveCount(0)
+  expect(paused).toHaveLength(1)
+})
+
+test("a failed wake asks before Nap or night is changed, and Keep sends nothing", async ({ page }) => {
+  const { andrew } = await caregiversOf(page)
+  const sleep = runningSleep(andrew.id, STARTED)
+  const { played, answer } = await playHousehold(page, sleepingToday(sleep))
+  await answer("**/api/sleeps/sleep-1", () => ({
+    status: 200,
+    json: { sleep: { ...sleep, kind: "night", version: 2 }, changed: [["today"]] },
+  }))
+  await loseSaves(page, "**/api/sleeps/sleep-1/wake", {
+    lost: 1,
+    until: Promise.resolve(),
+    answer: (body) => ({ sleep: { ...sleep, endedAt: body.occurredAt ?? NOW, version: 2 }, changed: [["today"]] }),
+  })
+  await openToday(page)
+  await page.clock.setFixedTime(FIRST_TAP)
+  const sheet = await openSheet(page, "Sleep")
+  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  await sheet.getByRole("button", { name: "Night", exact: true }).click()
+  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the wake-up at 9:30\sAM\?DiscardKeep$/u)
+  await sheet.getByRole("button", { name: "Keep" }).click()
+  await expect(sheet.getByRole("alert")).toContainText("No connection")
+  expect(played.sent).toEqual([])
+})
+
 test("a pause whose resend meets a change Pause anyway would still save asks before closing drops it", async ({
   page,
 }) => {
```

- [ ] **Step 2: Run them to see them fail.**
  - `pnpm exec vitest run apps/web/test/sheets-state.test.ts`. Expected: FAIL, the 14 tests of "one failed control per sheet". `blockerFor` and `askedBeforeSending` don't exist yet, and the ordering row gets the edit first.
  - `pnpm exec playwright test --config .superpowers/e2e.config.ts e2e/held-failures.spec.ts`. Expected: FAIL, 6 of 18 runs: the three new flows in both engines. Each has no question to answer.
- [ ] **Step 3: Write the code.** Invoke `frontend-ui-expert` and `react-code-standards` before the view changes (`sheet.tsx`, the provider), to check rather than redesign. Then `git checkout e7dfac8 -- apps/web/src/sheets/sheets-state.ts apps/web/src/sheets/sheets-provider.tsx apps/web/src/sheets/sheets-context.ts apps/web/src/sheets/sheet.tsx`:

`apps/web/src/sheets/sheets-state.ts`:

```diff
--- a/apps/web/src/sheets/sheets-state.ts
+++ b/apps/web/src/sheets/sheets-state.ts
@@ -1,5 +1,15 @@
+import type { Action } from "../api/actions.ts"
 import type { Saved } from "../api/send.ts"
-import { actionIdOf, editingOf, heldFor, isOnOpening, settlesWithoutAsking, withoutAction } from "./held.ts"
+import {
+  actionIdOf,
+  editingOf,
+  heldFor,
+  isHeld,
+  isOnOpening,
+  recordOf,
+  settlesWithoutAsking,
+  withoutAction,
+} from "./held.ts"
 import { stillSaveable } from "./saveable.ts"
 import {
   addsOrEdits,
@@ -13,6 +23,11 @@ import {
 } from "./sending.ts"
 import { editLost, type Toast, toastFor, undoLost } from "./undo.ts"
 
+export interface Pending {
+  readonly sending: Sending
+  readonly blocker: Failed
+}
+
 export interface SheetsState {
   readonly open: SheetKind | null
   readonly editing: string | null
@@ -23,6 +38,7 @@ export interface SheetsState {
   readonly keptOpen: string | null
   readonly toast: Toast | null
   readonly queued: boolean
+  readonly pending: Pending | null
 }
 
 export const CLOSED: SheetsState = {
@@ -35,18 +51,58 @@ export const CLOSED: SheetsState = {
   keptOpen: null,
   toast: null,
   queued: false,
+  pending: null,
 }
 
 const asksFirst = (failed: Failed) =>
   isEntry(failed.sending) ? !settlesWithoutAsking(failed.error) : stillSaveable(failed)
 
-const goesOnAnotherSend = ({ sending, error }: Failed) => !isEntry(sending) || settlesWithoutAsking(error)
+const STEPS = new Set<Action["kind"]>(["switchSide", "pauseFeed", "resumeFeed", "finishFeed", "wakeSleep"])
+
+const DELETES = new Set<Action["kind"]>([
+  "deleteFeed",
+  "deletePortion",
+  "deleteSleep",
+  "deleteDiaper",
+  "deleteDose",
+  "deleteMeasurement",
+])
+
+const replaces = (fresh: Sending, held: Sending) =>
+  recordOf(fresh) === recordOf(held) &&
+  (DELETES.has(fresh.action.kind) || (STEPS.has(fresh.action.kind) && STEPS.has(held.action.kind)))
+
+const replacedBy =
+  (fresh: Sending) =>
+  (failed: Failed): boolean =>
+    isEntry(failed.sending)
+      ? settlesWithoutAsking(failed.error)
+      : !stillSaveable(failed) || closesOnSave(failed.sending) || replaces(fresh, failed.sending)
 
 const withoutGoing = (held: ReadonlyArray<Failed>, sheet: SheetKind | null, editing: string | null) =>
   held.filter((failed) => !isOnOpening(failed, sheet, editing) || asksFirst(failed))
 
-const withoutReplaced = (held: ReadonlyArray<Failed>, sheet: SheetKind | null, editing: string | null) =>
-  held.filter((failed) => !isOnOpening(failed, sheet, editing) || !goesOnAnotherSend(failed))
+const withoutReplaced = (held: ReadonlyArray<Failed>, fresh: Sending) =>
+  held.filter((failed) => !isOnOpening(failed, fresh.sheet, editingOf(fresh)) || !replacedBy(fresh)(failed))
+
+export const blockerFor = (state: SheetsState, fresh: Sending): Failed | null =>
+  isHeld(state.held, fresh)
+    ? null
+    : (state.held.find(
+        (failed) =>
+          isOnOpening(failed, fresh.sheet, editingOf(fresh)) && !isEntry(failed.sending) && !replacedBy(fresh)(failed),
+      ) ?? null)
+
+const comesFirst = ({ sending }: Failed) => isEntry(sending) || STEPS.has(sending.action.kind)
+
+const heldWith = (held: ReadonlyArray<Failed>, failed: Failed): ReadonlyArray<Failed> => {
+  const behind = comesFirst(failed)
+    ? held.findIndex(
+        (other) => isOnOpening(other, failed.sending.sheet, editingOf(failed.sending)) && !comesFirst(other),
+      )
+    : -1
+  return behind === -1 ? [...held, failed] : [...held.slice(0, behind), failed, ...held.slice(behind)]
+}
 
 interface Opening {
   readonly sheet: SheetKind | null
@@ -68,6 +124,7 @@ const opening = (state: SheetsState, { sheet, editing, at }: Opening, queued: bo
   asking: false,
   keptOpen: null,
   queued,
+  pending: null,
 })
 
 const leaving = (state: SheetsState): SheetsState => ({
@@ -93,16 +150,23 @@ export const shownState = (
 export const dismissedState = (state: SheetsState): SheetsState => {
   if (state.open === null) return state
   const shown = heldFor(state.held, state.open, state.editing)
-  return shown !== null && asksFirst(shown) ? { ...state, asking: true } : closing(state)
+  return shown !== null && asksFirst(shown) ? { ...state, asking: true, pending: null } : closing(state)
 }
 
 export const dismissedKindState = (state: SheetsState, sheet: SheetKind): SheetsState =>
   state.open === sheet ? dismissedState(state) : state
 
-export const keptState = (state: SheetsState): SheetsState => ({ ...state, asking: false })
+export const keptState = (state: SheetsState): SheetsState => ({ ...state, asking: false, pending: null })
+
+export const askedBeforeSending = (state: SheetsState, sending: Sending, blocker: Failed): SheetsState => ({
+  ...state,
+  asking: true,
+  pending: { sending, blocker },
+})
 
 export const discardedState = (state: SheetsState, failed: Failed): SheetsState => {
   const held = withoutAction(state.held, actionIdOf(failed.sending))
+  if (state.pending !== null) return { ...state, held, asking: false, pending: null }
   return state.asking ? closing({ ...state, held }) : { ...state, held }
 }
 
@@ -117,7 +181,7 @@ export const failedState = (state: SheetsState, failed: Failed, now: number): Sh
   if (isUndo(failed.sending)) return { ...state, toast: undoLost(failed.error, now) }
   const own = state.keptOpen === actionIdOf(failed.sending)
   if (closesOnSave(failed.sending) && !own) return { ...state, toast: editLost(failed.error, now) }
-  const held = [...state.held, failed]
+  const held = heldWith(state.held, failed)
   if (state.open === null) return opening({ ...state, held }, openingFor(failed), true)
   if (landsInItsOwnSheet(state, failed, own)) return opening({ ...state, held }, openingFor(failed), false)
   return { ...state, held, keptOpen: own ? null : state.keptOpen }
@@ -132,7 +196,7 @@ export const reopenedState = (state: SheetsState): SheetsState => {
 
 export const sendingState = (state: SheetsState, sending: Sending, online: boolean): SheetsState => {
   const toast = isUndo(sending) ? null : state.toast
-  const held = withoutReplaced(withoutAction(state.held, actionIdOf(sending)), sending.sheet, editingOf(sending))
+  const held = withoutReplaced(withoutAction(state.held, actionIdOf(sending)), sending)
   const sent = { ...state, held, toast }
   if (closesOnSend(sending) && online) return state.open === null ? sent : closing(sent)
   if (!closesOnSend(sending) && !closesOnSave(sending)) return sent
```

`apps/web/src/sheets/sheets-provider.tsx`:

```diff
--- a/apps/web/src/sheets/sheets-provider.tsx
+++ b/apps/web/src/sheets/sheets-provider.tsx
@@ -5,6 +5,8 @@ import type { Sending, SheetKind } from "./sending.ts"
 import { type Sheets, SheetsContext } from "./sheets-context.ts"
 import {
   announcedState,
+  askedBeforeSending,
+  blockerFor,
   discardedState,
   dismissedKindState,
   dismissedState,
@@ -52,11 +54,16 @@ export const SheetsProvider = ({ restored, children }: SheetsProviderProps) => {
       sweepAfter(now)
     },
   })
-  const send = (sending: Sending) => {
+  const deliver = (sending: Sending) => {
     kept.sending(sending)
     setState((current) => sendingState(current, sending, online))
     mutation.mutate(sending)
   }
+  const send = (sending: Sending) => {
+    const blocker = blockerFor(state, sending)
+    if (blocker === null) deliver(sending)
+    else setState((current) => askedBeforeSending(current, sending, blocker))
+  }
   useResumedDraft(restored.resend, send)
   const sheets: Sheets = {
     ...state,
@@ -69,7 +76,9 @@ export const SheetsProvider = ({ restored, children }: SheetsProviderProps) => {
     keep: () => setState(keptState),
     discard: (failed) => {
       kept.done(failed.sending)
+      const waiting = state.pending
       setState((current) => discardedState(current, failed))
+      if (waiting !== null) deliver(waiting.sending)
     },
     send,
     announce: (toast) => {
```

`apps/web/src/sheets/sheets-context.ts`:

```diff
--- a/apps/web/src/sheets/sheets-context.ts
+++ b/apps/web/src/sheets/sheets-context.ts
@@ -1,6 +1,7 @@
 import { createContext, use } from "react"
 import { heldFor } from "./held.ts"
 import type { Failed, Sending, SheetKind } from "./sending.ts"
+import type { Pending } from "./sheets-state.ts"
 import type { Toast } from "./undo.ts"
 
 export type TimedSheet = "bottle" | "pastFeed" | "diaper" | "measurement" | "pastSleep" | "dose" | "logAt"
@@ -12,6 +13,7 @@ export interface Sheets {
   readonly opened: number
   readonly held: ReadonlyArray<Failed>
   readonly asking: boolean
+  readonly pending: Pending | null
   readonly busy: Sending | null
   readonly toast: Toast | null
   readonly queued: boolean
```

`apps/web/src/sheets/sheet.tsx`:

```diff
--- a/apps/web/src/sheets/sheet.tsx
+++ b/apps/web/src/sheets/sheet.tsx
@@ -17,7 +17,7 @@ interface SheetProps {
 
 export const Sheet = ({ sheet, title, description, children }: SheetProps) => {
   const sheets = useSheets()
-  const failed = failedFor(sheets, sheet)
+  const failed = sheets.pending?.blocker ?? failedFor(sheets, sheet)
   const asking = sheets.asking && sheets.open === sheet && failed !== null
   return (
     <Drawer
```

- [ ] **Step 4: Run them to see them pass.** The same commands. Expected: PASS. Then the sheet specs by path:
  - `e2e/held-failures.spec.ts`, `e2e/first-tap.spec.ts`, `e2e/nursing.spec.ts`, `e2e/nursing-edit.spec.ts`, `e2e/sleep.spec.ts`, `e2e/sleep-edit.spec.ts`
  - `e2e/discard-entry.spec.ts`, `e2e/edit-diaper.spec.ts`, `e2e/failed-control.spec.ts`, `e2e/empty-finish.spec.ts`, `e2e/diaper.spec.ts`

  Then `pnpm test`, `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 5: Commit.** `git add apps/web e2e/held-failures.spec.ts`, then `git commit -m "One failed control per sheet: while a sheet holds a failed control that could still be saved, another send that wouldn't replace it asks Discard …? first, held as pending. Keep sends nothing, Discard lets the failure go and sends it. Switch, Pause, Resume, Finish, Wake up or a delete that replaces it still does so without asking, and a failed step goes ahead of a failed edit on its sheet (#100)"`.

### Task 3: The docs

- [ ] **Step 1:** `git checkout dbda2eb -- docs/implementation-plan.md`. The M5.6 row gains "Decided 16 Oct 2026 (#100)", in the words of the Goal above, and the three "Decided 15 Oct 2026" sentences get their full stops.
- [ ] **Step 2:** `pnpm lint`.
- [ ] **Step 3:** `git add docs/implementation-plan.md`, then `git commit -m "Record #100 in the plan's M5.6 row: one failed control per sheet, and a conflict that offers … anyway asks before it goes. Give the three Decided 15 Oct 2026 sentences the full stop before them that #99's review noted"`.

## Finish

- [ ] **A fresh Opus final review of the branch against `320c495`,** briefed with the Review Focus.
  - Ask it to list **every** remaining path that drops a failure that could still be saved without asking, or logs a second entry.
  - Ask it to probe through the provider, not only the reducer. v1's review probes called `sendingState` directly, which bypasses `blockerFor`.
  - Any such path is Important: fix it test first in this PR, or bring it to Andrew before the PR opens.
- [ ] Run ci.yml's commands on the Mac, including the whole E2E suite in both engines.
- [ ] Push, open the PR (`Closes #100`), and give the device check:
  - Airplane mode on. Pause, then change the start: it asks "Discard the pause at …?". Keep, airplane mode off, and Try again: the pause lands at the first tap's time.
  - The same with Discard: the start changes, and the pause is gone.
- [ ] Comment on #100 at each step, and iterate on CodeRabbit until it approves. No merge.

## Unresolved questions

None block the build. P1–P7 are the plan's own calls, for veto. Three go beyond the decisions' exact words:
- **P2:** any send that would leave a second failure asks, not only an edit.
- **P5:** two sends already in flight are ordered rather than asked about.
- **P6:** a feed's delete asks first about a failed start change.

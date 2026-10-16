import {
  DiaperConflict,
  DoseConflict,
  FeedConflict,
  InvalidInput,
  MeasurementConflict,
  NotFound,
  ServiceUnavailable,
  type Sleep,
  SleepConflict,
  Unauthorized,
} from "@bt/contracts"
import { describe, expect, it } from "vitest"
import type { SleepAction } from "../src/api/actions.ts"
import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"
import { StaleDraft } from "../src/sheets/drafts.ts"
import { failureNote, type Household } from "../src/sheets/failure.ts"
import { offersRetry } from "../src/sheets/held.ts"
import { keptOnFor } from "../src/sheets/kept-on.ts"
import { Unsaved } from "../src/sheets/kept.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { measurement } from "./growth-fixtures.ts"
import { ANDREW, diaperAt, dosedAt, EMILY, feedAt, MINUTE, NOW, sleptAt, ZONE } from "./today-fixtures.ts"

const HOUSEHOLD: Household = {
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  timeZone: ZONE,
  childName: "Robin",
  locale: "en-US",
}

const WOKE: Sending = {
  sheet: "sleep",
  action: {
    kind: "wakeSleep",
    id: "sleep-1",
    payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", version: 1, occurredAt: NOW },
  },
}

const DIAPER: Sending = {
  sheet: "diaper",
  action: {
    kind: "logDiaper",
    payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", occurredAt: NOW, wet: true, dirty: false },
  },
}

const onSleep = (action: SleepAction): Sending => ({ sheet: "sleep", action })

const TAPPED = NOW - 10 * MINUTE

const WOKE_EARLIER = onSleep({
  kind: "wakeSleep",
  id: "sleep-1",
  payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", version: 1, occurredAt: TAPPED },
})

const NAPPED = onSleep({
  kind: "editSleep",
  id: "sleep-1",
  payload: {
    actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a",
    version: 1,
    kind: "nap",
    startedAt: NOW - 60 * MINUTE,
    endedAt: null,
  },
})

const SLEEP_DELETED = onSleep({
  kind: "deleteSleep",
  id: "sleep-1",
  payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", version: 1 },
})

const RESUMED_LEFT: Sending = {
  sheet: "nursing",
  action: {
    kind: "resumeFeed",
    id: "feed-1",
    payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", version: 2, side: "left", occurredAt: TAPPED },
  },
}

const EDITED_SLEEP: Sending = { ...NAPPED, sheet: "editSleep" }

const message = (error: Error) => failureNote(error, HOUSEHOLD, { keptOn: "phone" }).message.replace(/\s/gu, " ")

const staleSleep = (current: Sleep, sending: Sending) => {
  const error = new SleepConflict({ code: "STALE_VERSION", current })
  return failureNote(error, HOUSEHOLD, { keptOn: "app", sheet: "sleep", sending }).message.replace(/\s/gu, " ")
}

describe("failureNote", () => {
  it("says an entry with no connection is kept on this phone, and offers to try again", () => {
    expect(failureNote(new Offline(), HOUSEHOLD, { keptOn: "phone" })).toEqual({
      message: "No connection. This is kept on this phone: try again once you're back online.",
      retry: "Try again",
      signIn: false,
    })
    expect(failureNote(new ServiceUnavailable(), HOUSEHOLD, { keptOn: "phone" }).retry).toBe("Try again")
  })

  it("asks to keep the app open for an entry the phone can't keep", () => {
    expect(failureNote(new Offline(), HOUSEHOLD, { keptOn: "app" }).message).toBe(
      "No connection. Keep the app open, and try again once you're back online.",
    )
  })

  it("keeps a control on Nursing or Sleep on this phone, and asks to keep the app open for one from an Edit sheet", () => {
    expect([keptOnFor(WOKE, true), keptOnFor(WOKE, false), keptOnFor(EDITED_SLEEP, true)]).toEqual([
      "phone",
      "app",
      "app",
    ])
  })

  it("keeps an entry on this phone while the phone can keep it, and asks to keep the app open when it can't", () => {
    expect([keptOnFor(DIAPER, true), keptOnFor(DIAPER, false)]).toEqual(["phone", "app"])
  })

  it("asks to sign in when Access or the household has signed the parent out", () => {
    for (const error of [new AuthRequired(), new Unauthorized()]) {
      expect(failureNote(error, HOUSEHOLD, { keptOn: "phone" })).toEqual({
        message: "Your sign-in has expired. Sign in, and this will be saved.",
        retry: null,
        signIn: true,
      })
    }
  })

  it("names who started the running feed, and when", () => {
    const current = feedAt(NOW - 20 * MINUTE, { createdBy: EMILY })
    expect(message(new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current }))).toBe("Emily started a feed at 9:10 AM.")
  })

  it("names the feed a past feed overlaps, running or not", () => {
    const done = feedAt(NOW - 60 * MINUTE, { endedAt: NOW - 45 * MINUTE })
    const running = feedAt(NOW - 10 * MINUTE, { endedAt: null })
    expect(message(new FeedConflict({ code: "SEGMENT_OVERLAP", current: done }))).toBe(
      "This overlaps the feed at 8:30 AM–8:45 AM.",
    )
    expect(message(new FeedConflict({ code: "SEGMENT_OVERLAP", current: running }))).toBe(
      "This overlaps the feed at 9:20 AM–now.",
    )
  })

  it("says who changed a feed or diaper a moment ago", () => {
    const feed = feedAt(NOW, { updatedBy: EMILY })
    const diaper = diaperAt(NOW, { updatedBy: ANDREW })
    expect(message(new FeedConflict({ code: "STALE_VERSION", current: feed }))).toBe(
      "Emily changed this feed a moment ago.",
    )
    expect(message(new DiaperConflict({ code: "STALE_VERSION", current: diaper }))).toBe(
      "Andrew changed this diaper a moment ago.",
    )
  })

  it("says a resent entry with new values was already saved as first entered", () => {
    expect(message(new FeedConflict({ code: "ACTION_REPLAY_MISMATCH", current: feedAt(NOW) }))).toBe(
      "This was already saved as you first entered it.",
    )
    expect(message(new DiaperConflict({ code: "ACTION_REPLAY_MISMATCH", current: diaperAt(NOW) }))).toBe(
      "This was already saved as you first entered it.",
    )
  })

  it("explains the time the household refused", () => {
    const refused = (issue: "in_future" | "before_birth" | "end_not_after_start" | "out_of_range" | "invalid") =>
      message(new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue }] }))
    expect(refused("in_future")).toBe("That time is in the future.")
    expect(refused("before_birth")).toBe("That's before Robin was born.")
    expect(refused("end_not_after_start")).toBe("Pick a time after this side started.")
    expect(refused("out_of_range")).toBe("A side can run for 4 hours at most.")
    expect(refused("invalid")).toBe("Check the times and amounts, then try again.")
  })

  it("names who started the running sleep, and when", () => {
    const current = sleptAt(NOW - 20 * MINUTE, { createdBy: EMILY, endedAt: null })
    expect(message(new SleepConflict({ code: "SLEEP_ALREADY_ACTIVE", current }))).toBe(
      "Emily started a sleep at 9:10 AM.",
    )
  })

  it("names the nap or night a sleep overlaps, running or not", () => {
    const nap = sleptAt(NOW - 60 * MINUTE, { endedAt: NOW - 45 * MINUTE })
    const night = sleptAt(NOW - 10 * MINUTE, { kind: "night", endedAt: null })
    expect(message(new SleepConflict({ code: "SLEEP_OVERLAP", current: nap }))).toBe(
      "This overlaps the nap at 8:30 AM–8:45 AM.",
    )
    expect(message(new SleepConflict({ code: "SLEEP_OVERLAP", current: night }))).toBe(
      "This overlaps the night at 9:20 AM–now.",
    )
  })

  it("says who changed or deleted a sleep a moment ago, or that it was already saved", () => {
    const changed = sleptAt(NOW, { updatedBy: EMILY, version: 2 })
    expect(message(new SleepConflict({ code: "STALE_VERSION", current: changed }))).toBe(
      "Emily changed this sleep a moment ago.",
    )
    expect(message(new SleepConflict({ code: "STALE_VERSION", current: { ...changed, deletedAt: NOW } }))).toBe(
      "Emily deleted this sleep a moment ago.",
    )
    expect(message(new SleepConflict({ code: "ACTION_REPLAY_MISMATCH", current: changed }))).toBe(
      "This was already saved as you first entered it.",
    )
  })

  it("says who woke her, and when, when the other phone's wake reached the household first", () => {
    const woken = sleptAt(NOW - 60 * MINUTE, { updatedBy: EMILY, endedAt: NOW - 20 * MINUTE, version: 3 })
    expect(staleSleep(woken, WOKE)).toBe("Emily woke her at 9:10 AM.")
  })

  it("keeps changed and deleted for a stale edit or delete, for a wake that finds her asleep, and for a deleted sleep", () => {
    const woken = sleptAt(NOW - 60 * MINUTE, { updatedBy: EMILY, endedAt: NOW - 20 * MINUTE, version: 3 })
    expect(staleSleep(woken, NAPPED)).toBe("Emily changed this sleep a moment ago.")
    expect(staleSleep(woken, SLEEP_DELETED)).toBe("Emily changed this sleep a moment ago.")
    expect(staleSleep({ ...woken, endedAt: null }, WOKE)).toBe("Emily changed this sleep a moment ago.")
    expect(staleSleep({ ...woken, deletedAt: NOW }, WOKE)).toBe("Emily deleted this sleep a moment ago.")
  })

  it("explains a refused sleep time in a sleep's words", () => {
    const refused = (issue: "end_not_after_start" | "out_of_range", sheet: "sleep" | "pastSleep" | "editSleep") =>
      failureNote(new InvalidInput({ fieldErrors: [{ path: "endedAt", issue }] }), HOUSEHOLD, { keptOn: "app", sheet })
        .message
    expect(refused("end_not_after_start", "sleep")).toBe("Pick a time after she fell asleep.")
    expect(refused("out_of_range", "pastSleep")).toBe("A sleep can last a day at most.")
    expect(refused("end_not_after_start", "editSleep")).toBe("Pick a time after she fell asleep.")
  })

  it("asks a sleep sheet to check only the times when the household refuses a field with no message of its own", () => {
    const refused = (sheet: "sleep" | "pastSleep" | "editSleep" | "pastFeed" | "diaper") =>
      failureNote(new InvalidInput({ fieldErrors: [{ path: "kind", issue: "invalid" }] }), HOUSEHOLD, {
        keptOn: "app",
        sheet,
      }).message
    expect([refused("sleep"), refused("pastSleep"), refused("editSleep")]).toEqual([
      "Check the times, then try again.",
      "Check the times, then try again.",
      "Check the times, then try again.",
    ])
    expect([refused("pastFeed"), refused("diaper")]).toEqual([
      "Check the times and amounts, then try again.",
      "Check the times and amounts, then try again.",
    ])
  })

  it("says the running feed changed when the household no longer has it as it was", () => {
    expect(message(new NotFound())).toBe("This has changed since it opened. Today is up to date now.")
  })

  it("asks before saving an entry kept through a reload, with when it was kept and whether it failed", () => {
    expect(failureNote(new Unsaved({ keptAt: NOW, failed: true }), HOUSEHOLD, { keptOn: "phone" })).toMatchObject({
      message: expect.stringMatching(/^This wasn't saved, Fri 9:30\sAM\. Save it now\?$/u),
      retry: "Save now",
    })
    expect(failureNote(new Unsaved({ keptAt: NOW, failed: false }), HOUSEHOLD, { keptOn: "phone" })).toMatchObject({
      message: expect.stringMatching(/^This might not have been saved, Fri 9:30\sAM\. Save it now\?$/u),
      retry: "Save now",
    })
  })

  it("names a control kept through a reload, with when it was tapped, or when it was kept if it has no tap time", () => {
    const unsaved = (sending: Sending, failed = true) =>
      failureNote(new Unsaved({ keptAt: NOW, failed }), HOUSEHOLD, { keptOn: "phone", sheet: sending.sheet, sending })
        .message
    expect(unsaved(WOKE_EARLIER)).toMatch(/^The wake-up wasn't saved, Fri 9:20\sAM\. Save it now\?$/u)
    expect(unsaved(RESUMED_LEFT)).toMatch(/^Resuming on Left wasn't saved, Fri 9:20\sAM\. Save it now\?$/u)
    expect(unsaved(NAPPED)).toMatch(/^Your changes weren't saved, Fri 9:30\sAM\. Save them now\?$/u)
    expect(unsaved(SLEEP_DELETED)).toMatch(/^The delete wasn't saved, Fri 9:30\sAM\. Save it now\?$/u)
    expect(unsaved(WOKE_EARLIER, false)).toMatch(
      /^The wake-up might not have been saved, Fri 9:20\sAM\. Save it now\?$/u,
    )
    expect(unsaved(DIAPER)).toMatch(/^This wasn't saved, Fri 9:30\sAM\. Save it now\?$/u)
  })

  it("asks before saving a draft that waited too long, with when it was kept", () => {
    expect(failureNote(new StaleDraft({ createdAt: NOW }), HOUSEHOLD, { keptOn: "phone" })).toMatchObject({
      message: expect.stringMatching(/^This wasn't saved before you signed in, Fri 9:30\sAM\. Save it now\?$/u),
      retry: "Save now",
    })
  })

  it("says who changed or deleted a measurement a moment ago", () => {
    const current = { ...measurement("m1", NOW, { weightG: 4300 }), updatedBy: EMILY }
    expect(message(new MeasurementConflict({ code: "STALE_VERSION", current }))).toBe(
      "Emily changed this measurement a moment ago.",
    )
    expect(message(new MeasurementConflict({ code: "STALE_VERSION", current: { ...current, deletedAt: NOW } }))).toBe(
      "Emily deleted this measurement a moment ago.",
    )
    expect(message(new MeasurementConflict({ code: "ACTION_REPLAY_MISMATCH", current }))).toBe(
      "This was already saved as you first entered it.",
    )
  })

  it("says when a dose that day was already logged and by whom, and who changed or deleted a dose a moment ago", () => {
    const current = { ...dosedAt(NOW - 200 * MINUTE), updatedBy: ANDREW }
    expect(message(new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current }))).toBe(
      "This was already logged at 6:10 AM by Emily.",
    )
    expect(message(new DoseConflict({ code: "STALE_VERSION", current }))).toBe("Andrew changed this dose a moment ago.")
    expect(message(new DoseConflict({ code: "STALE_VERSION", current: { ...current, deletedAt: NOW } }))).toBe(
      "Andrew deleted this dose a moment ago.",
    )
    expect(message(new DoseConflict({ code: "ACTION_REPLAY_MISMATCH", current }))).toBe(
      "This was already saved as you first entered it.",
    )
  })

  it.each(["weightG", "lengthCm", "headCm"])("asks to check the measurements when the household refuses %s", (path) => {
    const refused = new InvalidInput({ fieldErrors: [{ path, issue: "invalid" }] })
    expect(message(refused)).toBe("Check the measurements, then try again.")
  })

  it("asks to check the measurements when the household refuses one of them beside a field with no message of its own", () => {
    const refused = new InvalidInput({
      fieldErrors: [
        { path: "measuredAt", issue: "invalid" },
        { path: "weightG", issue: "invalid" },
      ],
    })
    expect(message(refused)).toBe("Check the measurements, then try again.")
  })

  it("says a measurement changed, and that Growth is up to date, when the household no longer has it", () => {
    expect(failureNote(new NotFound(), HOUSEHOLD, { keptOn: "phone", sheet: "measurement" }).message).toBe(
      "This measurement has changed since it opened. Growth is up to date now.",
    )
  })

  it("keeps Today's wording when the household no longer has what a Today sheet opened on", () => {
    expect(failureNote(new NotFound(), HOUSEHOLD, { keptOn: "phone", sheet: "bottle" }).message).toBe(
      "This has changed since it opened. Today is up to date now.",
    )
  })
})

describe("offersRetry", () => {
  const feed = feedAt(NOW, { id: "feed-1" })
  it.each([
    ["no connection", new Offline()],
    ["a household that's unavailable", new ServiceUnavailable()],
    ["an answer it can't read", new Unexpected({ status: 500 })],
    ["a draft from before sign-in", new StaleDraft({ createdAt: NOW })],
    ["an entry kept on the phone", new Unsaved({ keptAt: NOW, failed: true })],
    ["an expired sign-in", new AuthRequired()],
    ["a refused sign-in", new Unauthorized()],
    ["a time it refused", new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "in_future" }] })],
    ["a record that's gone", new NotFound()],
    ["the other phone's change", new FeedConflict({ code: "STALE_VERSION", current: feed })],
    ["a diaper conflict", new DiaperConflict({ code: "STALE_VERSION", current: diaperAt(NOW) })],
    ["a measurement conflict", new MeasurementConflict({ code: "STALE_VERSION", current: measurement("m1", NOW, {}) })],
    ["a sleep conflict", new SleepConflict({ code: "STALE_VERSION", current: sleptAt(NOW) })],
    ["a dose that day already", new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current: dosedAt(NOW) })],
  ])("is true exactly when the note offers a retry button: %s", (_case, error) => {
    expect(offersRetry(error)).toBe(failureNote(error, HOUSEHOLD, { keptOn: "app" }).retry !== null)
  })
})

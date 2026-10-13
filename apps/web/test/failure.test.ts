import {
  DiaperConflict,
  FeedConflict,
  InvalidInput,
  MeasurementConflict,
  NotFound,
  ServiceUnavailable,
  SleepConflict,
  Unauthorized,
} from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline } from "../src/api/errors.ts"
import { StaleDraft } from "../src/sheets/drafts.ts"
import { failureNote, type Household } from "../src/sheets/failure.ts"
import { Unsaved } from "../src/sheets/kept.ts"
import { measurement } from "./growth-fixtures.ts"
import { ANDREW, diaperAt, EMILY, feedAt, MINUTE, NOW, sleptAt, ZONE } from "./today-fixtures.ts"

const HOUSEHOLD: Household = {
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  timeZone: ZONE,
  childName: "Robin",
  locale: "en-US",
}

const message = (error: Error) => failureNote(error, HOUSEHOLD, { keptOn: "phone" }).message.replace(/\s/gu, " ")

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

  it("promises nothing kept for a control with no connection, since it goes with its sheet", () => {
    expect(failureNote(new Offline(), HOUSEHOLD, { keptOn: null })).toEqual({
      message: "No connection. Try again once you're back online.",
      retry: "Try again",
      signIn: false,
    })
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

  it("explains a refused sleep time in a sleep's words", () => {
    const refused = (issue: "end_not_after_start" | "out_of_range", sheet: "sleep" | "pastSleep" | "editSleep") =>
      failureNote(new InvalidInput({ fieldErrors: [{ path: "endedAt", issue }] }), HOUSEHOLD, { keptOn: null, sheet })
        .message
    expect(refused("end_not_after_start", "sleep")).toBe("Pick a time after she fell asleep.")
    expect(refused("out_of_range", "pastSleep")).toBe("A sleep can last a day at most.")
    expect(refused("end_not_after_start", "editSleep")).toBe("Pick a time after she fell asleep.")
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

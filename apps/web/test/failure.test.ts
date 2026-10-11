import { DiaperConflict, FeedConflict, InvalidInput, NotFound, ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline } from "../src/api/errors.ts"
import { StaleDraft } from "../src/sheets/drafts.ts"
import { failureNote, type Household } from "../src/sheets/failure.ts"
import { ANDREW, diaperAt, EMILY, feedAt, MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const HOUSEHOLD: Household = {
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  timeZone: ZONE,
  childName: "Robin",
  locale: "en-US",
}

const message = (error: Error) => failureNote(error, HOUSEHOLD).message.replace(/\s/gu, " ")

describe("failureNote", () => {
  it("keeps the entry and offers to try again when there's no connection or the household is busy", () => {
    expect(failureNote(new Offline(), HOUSEHOLD)).toEqual({
      message: "No connection. This is kept here: try again once you're back online.",
      retry: "Try again",
      signIn: false,
    })
    expect(failureNote(new ServiceUnavailable(), HOUSEHOLD).retry).toBe("Try again")
  })

  it("asks to sign in when Access or the household has signed the parent out", () => {
    for (const error of [new AuthRequired(), new Unauthorized()]) {
      expect(failureNote(error, HOUSEHOLD)).toEqual({
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

  it("says the running feed changed when the household no longer has it as it was", () => {
    expect(message(new NotFound())).toBe("This has changed since it opened. Today is up to date now.")
  })

  it("asks before saving a draft that waited too long, with when it was kept", () => {
    expect(failureNote(new StaleDraft({ createdAt: NOW }), HOUSEHOLD)).toMatchObject({
      message: expect.stringMatching(/^This wasn't saved before you signed in, Fri 9:30\sAM\. Save it now\?$/u),
      retry: "Save now",
    })
  })
})

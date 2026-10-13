import { type Feed, FeedConflict, InvalidInput, NotFound } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"
import { pendingId } from "../src/api/pending.ts"
import {
  bottleAction,
  bottleSession,
  canSaveBottle,
  type HeldRoute,
  hasMilk,
  toppedUpFeed,
  toppedUpFor,
  topUpNote,
} from "../src/features/feed/bottle-entry.ts"
import { clockOf } from "../src/sheets/clock.ts"
import { StaleDraft } from "../src/sheets/drafts.ts"
import { Unsaved } from "../src/sheets/kept.ts"
import { feedAt, MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const AMOUNTS = { breastMilkMl: 59.1, formulaMl: 0 }
const UNSAVED_BOTTLE = {
  sending: {
    sheet: "bottle" as const,
    action: {
      kind: "addBottle" as const,
      id: "feed-1",
      payload: { actionId: ACTION_ID, version: 2, occurredAt: Date.UTC(2026, 9, 9, 16, 0), ...AMOUNTS },
    },
  },
  error: new Error(),
}

describe("bottleSession", () => {
  it("starts from the household's last bottle, at Now", () => {
    const prefill = { lastBottle: AMOUNTS, lastSide: null }
    expect(bottleSession(null, prefill, ZONE, null)).toMatchObject({ ...AMOUNTS, when: { kind: "now" } })
  })

  it("starts at the time it was opened at, from History's empty slot", () => {
    const opened = Date.UTC(2026, 9, 9, 9, 15)
    expect(bottleSession(null, undefined, ZONE, opened).when).toEqual({
      kind: "at",
      local: "2026-10-09T02:15",
      pick: null,
    })
  })

  it("starts empty when no bottle has been logged yet", () => {
    expect(bottleSession(null, undefined, ZONE, null)).toMatchObject({ breastMilkMl: 0, formulaMl: 0 })
  })

  it("reopens a bottle that wasn't saved with its amounts, time and actionId", () => {
    expect(bottleSession(UNSAVED_BOTTLE, undefined, ZONE, null)).toEqual({
      actionId: ACTION_ID,
      ...AMOUNTS,
      when: { kind: "at", local: "2026-10-09T09:00", pick: null },
      held: { kind: "addBottle", id: "feed-1", version: 2 },
    })
  })

  it("keeps a failed save's own time over the time the sheet was opened at", () => {
    const opened = Date.UTC(2026, 9, 9, 9, 15)
    expect(bottleSession(UNSAVED_BOTTLE, undefined, ZONE, opened).when).toEqual({
      kind: "at",
      local: "2026-10-09T09:00",
      pick: null,
    })
  })
})

describe("bottleAction", () => {
  it("logs a bottle on its own as a feed with one portion", () => {
    expect(bottleAction(ACTION_ID, AMOUNTS, NOW, null)).toEqual({
      kind: "logFeed",
      payload: { actionId: ACTION_ID, segments: [], portions: [{ occurredAt: NOW, ...AMOUNTS }] },
    })
  })

  it("adds the bottle to a running feed, with the feed's version", () => {
    const running = feedAt(NOW - 600_000, { id: "feed-1", status: "active", version: 3 })
    expect(bottleAction(ACTION_ID, AMOUNTS, NOW, running)).toEqual({
      kind: "addBottle",
      id: "feed-1",
      payload: { actionId: ACTION_ID, version: 3, occurredAt: NOW, ...AMOUNTS },
    })
  })
})

describe("a bottle timed against the feed that's running or paused", () => {
  const active = feedAt(NOW - 10 * MINUTE, { id: "feed-1", status: "active", version: 3 })

  it("is its own feed a minute before that feed started, so the feed's start stays put", () => {
    const occurredAt = active.startedAt - MINUTE
    expect(toppedUpFeed(active, occurredAt)).toBeNull()
    expect(bottleAction(ACTION_ID, AMOUNTS, occurredAt, active)).toEqual({
      kind: "logFeed",
      payload: { actionId: ACTION_ID, segments: [], portions: [{ occurredAt, ...AMOUNTS }] },
    })
  })

  it.each([
    { label: "exactly when it started", occurredAt: active.startedAt },
    { label: "after it started", occurredAt: active.startedAt + MINUTE },
  ])("tops the feed up $label", ({ occurredAt }) => {
    expect(toppedUpFeed(active, occurredAt)).toBe(active)
    expect(bottleAction(ACTION_ID, AMOUNTS, occurredAt, active)).toMatchObject({ kind: "addBottle", id: "feed-1" })
  })

  it("tops up the running feed with a bottle picked in its start minute, at the start's instant", () => {
    const feed = feedAt(active.startedAt + 27_000, { id: "feed-1", status: "active", version: 3 })
    expect(toppedUpFeed(feed, active.startedAt)).toBe(feed)
    expect(bottleAction(ACTION_ID, AMOUNTS, active.startedAt, feed)).toEqual({
      kind: "addBottle",
      id: "feed-1",
      payload: { actionId: ACTION_ID, version: 3, occurredAt: feed.startedAt, ...AMOUNTS },
    })
  })

  it("is its own feed with no feed running", () => {
    expect(toppedUpFeed(null, NOW)).toBeNull()
  })
})

describe("hasMilk", () => {
  it("needs some milk, and both amounts readable", () => {
    expect(hasMilk(AMOUNTS)).toBe(true)
    expect(hasMilk({ breastMilkMl: 0, formulaMl: 0 })).toBe(false)
    expect(hasMilk({ breastMilkMl: null, formulaMl: 30 })).toBe(false)
  })
})

describe("canSaveBottle", () => {
  const running = feedAt(NOW - 600_000, { id: "feed-1", status: "active", version: 3 })

  it("needs some milk", () => {
    expect(canSaveBottle({ breastMilkMl: 0, formulaMl: 0 }, null)).toBe(false)
  })

  it("saves a bottle on its own when no feed is running", () => {
    expect(canSaveBottle(AMOUNTS, null)).toBe(true)
  })

  it("tops up a running feed", () => {
    expect(canSaveBottle(AMOUNTS, running)).toBe(true)
  })

  it("waits while a bottle added to the feed hasn't been answered, since the feed's version is stale", () => {
    const topUp = { id: pendingId("action-2"), occurredAt: NOW, ...AMOUNTS }
    expect(canSaveBottle(AMOUNTS, { ...running, portions: [topUp] })).toBe(false)
  })

  it("waits while the feed itself hasn't been answered", () => {
    expect(canSaveBottle(AMOUNTS, { ...running, id: pendingId("action-1") })).toBe(false)
  })
})

describe("a held bottle", () => {
  const running = feedAt(NOW - 20 * MINUTE, { id: "feed-9", status: "active", endedAt: null, version: 4 })
  const newer = { ...running, id: "feed-1", version: 5 }
  const loggedAlone = { kind: "logFeed" } as const
  const toppedUp = { kind: "addBottle", id: "feed-1", version: 2 } as const

  it("stays a bottle on its own when a feed has started since it failed", () => {
    expect(bottleAction(ACTION_ID, AMOUNTS, NOW, running, loggedAlone)).toMatchObject({ kind: "logFeed" })
    expect(toppedUpFor(running, NOW, loggedAlone)).toBeNull()
  })

  it("stays a top-up of its own feed, at the version it first went at, even once another feed runs", () => {
    expect(bottleAction(ACTION_ID, AMOUNTS, NOW, running, toppedUp)).toMatchObject({
      kind: "addBottle",
      id: "feed-1",
      payload: { actionId: ACTION_ID, version: 2 },
    })
    expect(toppedUpFor(running, NOW, toppedUp)).toBeNull()
  })

  it("resends a top-up at the version it first went at while its feed is active at a newer one, so a send that landed replays", () => {
    expect(toppedUpFor(newer, NOW, toppedUp)).toBe(newer)
    expect(bottleAction(ACTION_ID, AMOUNTS, NOW, newer, toppedUp)).toEqual({
      kind: "addBottle",
      id: "feed-1",
      payload: { actionId: ACTION_ID, version: 2, occurredAt: NOW, ...AMOUNTS },
    })
  })

  it("keeps a still-active feed's start for the start-minute clamp, at the version it first went at", () => {
    const startedAt = newer.startedAt + 27_000
    expect(bottleAction(ACTION_ID, AMOUNTS, newer.startedAt, { ...newer, startedAt }, toppedUp)).toEqual({
      kind: "addBottle",
      id: "feed-1",
      payload: { actionId: ACTION_ID, version: 2, occurredAt: startedAt, ...AMOUNTS },
    })
  })
})

describe("a bottle's held route", () => {
  it("keeps the route of a failure whose actionId may hold a receipt, and lets a renewed draft's go", () => {
    expect(bottleSession(UNSAVED_BOTTLE, undefined, ZONE, null).held).toEqual({
      kind: "addBottle",
      id: "feed-1",
      version: 2,
    })
    const stale = { ...UNSAVED_BOTTLE, error: new StaleDraft({ createdAt: NOW - 13 * 60 * MINUTE }) }
    expect(bottleSession(stale, undefined, ZONE, null).held).toBeNull()
  })
})

describe("a bottle's held route after the household answers", () => {
  const running = feedAt(NOW - 20 * MINUTE, { id: "feed-9", status: "active", endedAt: null, version: 4 })
  const saved = feedAt(NOW - 30 * MINUTE, { id: "feed-1", version: 3 })
  const reopenedAfter = (error: Error) => bottleSession({ ...UNSAVED_BOTTLE, error }, undefined, ZONE, null)

  it.each([
    { case: "a stale version", error: new FeedConflict({ code: "STALE_VERSION", current: saved }) },
    { case: "no feed to add to", error: new NotFound() },
  ])("lets a top-up go back to today's rule when the household answers $case, since nothing was saved", ({ error }) => {
    const { actionId, held } = reopenedAfter(error)
    expect(held).toBeNull()
    expect(bottleAction(actionId, AMOUNTS, NOW, null, held)).toMatchObject({ kind: "logFeed" })
    expect(bottleAction(actionId, AMOUNTS, NOW, running, held)).toMatchObject({
      kind: "addBottle",
      id: "feed-9",
      payload: { actionId: ACTION_ID, version: 4 },
    })
  })

  it("sends a top-up at its feed's live version once the household refuses the first, since nothing was saved", () => {
    const live = feedAt(NOW - 40 * MINUTE, { id: "feed-1", status: "active", endedAt: null, version: 5 })
    const { actionId, held } = reopenedAfter(new FeedConflict({ code: "STALE_VERSION", current: live }))
    expect(held).toBeNull()
    expect(bottleAction(actionId, AMOUNTS, NOW, live, held)).toEqual({
      kind: "addBottle",
      id: "feed-1",
      payload: { actionId: ACTION_ID, version: 5, occurredAt: NOW, ...AMOUNTS },
    })
  })

  it.each([
    { case: "no connection", error: new Offline() },
    { case: "an unexpected answer", error: new Unexpected({ status: 500 }) },
    { case: "a sign-in that ran out", error: new AuthRequired() },
    { case: "a copy kept unsaved", error: new Unsaved({ keptAt: NOW, failed: true }) },
    {
      case: "a receipt for another request",
      error: new FeedConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
    },
    {
      case: "an invalid input, which is also how a receipt on another route answers",
      error: new InvalidInput({ fieldErrors: [{ path: "actionId", issue: "invalid" }] }),
    },
  ])("keeps a top-up on its own feed after $case, since the household may hold a receipt", ({ error }) => {
    expect(reopenedAfter(error).held).toEqual({ kind: "addBottle", id: "feed-1", version: 2 })
  })
})

describe("the note on where a bottle is saved", () => {
  const running = feedAt(NOW - 10 * MINUTE, { id: "feed-1", status: "active", endedAt: null, version: 3 })
  const another = feedAt(NOW - 20 * MINUTE, { id: "feed-9", status: "active", endedAt: null, version: 4 })
  const heldTopUp = { kind: "addBottle", id: "feed-1", version: 2 } as const
  const startNote = `Adds to the feed that started at ${clockOf(running.startedAt, ZONE)}.`
  const noteFor = (active: Feed | null, held: HeldRoute) => topUpNote(toppedUpFor(active, NOW, held), held, ZONE)

  it("names when the feed being topped up started", () => {
    expect(noteFor(running, null)).toBe(startNote)
  })

  it("names it for a held top-up too, while its feed is still active", () => {
    expect(noteFor(running, heldTopUp)).toBe(startNote)
  })

  it.each([
    { case: "no feed is active", active: null },
    { case: "another feed is the active one", active: another },
  ])("says a held top-up still goes to the feed it was first added to when $case", ({ active }) => {
    expect(noteFor(active, heldTopUp)).toBe("Adds to the feed it was first added to.")
  })

  it("says nothing of a bottle that's its own feed", () => {
    expect(noteFor(null, null)).toBeNull()
    expect(noteFor(running, { kind: "logFeed" })).toBeNull()
  })
})

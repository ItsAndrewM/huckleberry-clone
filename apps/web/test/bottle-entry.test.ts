import { describe, expect, it } from "vitest"
import { pendingId } from "../src/api/pending.ts"
import { bottleAction, bottleSession, canSaveBottle, hasMilk, toppedUpFeed } from "../src/features/feed/bottle-entry.ts"
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

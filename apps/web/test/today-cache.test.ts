import { describe, expect, it } from "vitest"
import { pendingId } from "../src/api/pending.ts"
import { pendingToday, savedToday } from "../src/api/today-cache.ts"
import { ANDREW, diaperAt, feedAt, MINUTE, NO_TOTALS, NOW, nursedFor, todayWith, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const OTHER_ACTION_ID = "9d2e7f40-1a3b-4c5d-8e6f-7a8b9c0d1e2f"
const pending = { by: ANDREW, now: NOW, zone: ZONE }
const MIDNIGHT = Date.UTC(2026, 9, 9, 7)

describe("pendingToday", () => {
  it("lists a diaper being saved first, and counts it in today's totals", () => {
    const earlier = diaperAt(NOW - 60 * MINUTE)
    const today = todayWith({ recent: [{ kind: "diaper", diaper: earlier }] })
    const next = pendingToday(
      today,
      { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: NOW, wet: false, dirty: true } },
      pending,
    )
    expect(next.recent.map((entry) => (entry.kind === "diaper" ? entry.diaper.id : ""))).toEqual([
      pendingId(ACTION_ID),
      earlier.id,
    ])
    expect(next.totals).toEqual({ ...NO_TOTALS, diapers: 1, dirtyDiapers: 1 })
  })

  it("leaves today's totals alone for a diaper backdated to yesterday", () => {
    const next = pendingToday(
      todayWith(),
      { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: MIDNIGHT - MINUTE, wet: true, dirty: false } },
      pending,
    )
    expect(next.totals).toEqual(NO_TOTALS)
    expect(next.recent).toHaveLength(1)
  })

  it("shows a feed being started as the running feed, from its start", () => {
    const next = pendingToday(
      todayWith(),
      { kind: "startFeed", payload: { actionId: ACTION_ID, side: "left", startedAt: NOW - 2 * MINUTE } },
      pending,
    )
    expect(next.activeFeed).toMatchObject({ id: pendingId(ACTION_ID), status: "active", startedAt: NOW - 2 * MINUTE })
    expect(next.lastFeed?.id).toBe(pendingId(ACTION_ID))
    expect(next.totals).toMatchObject({ feedsStarted: 1, leftSeconds: 120, nursingSeconds: 120 })
  })

  it("adds a bottle to the running feed without counting another feed", () => {
    const running = { ...nursedFor(feedAt(NOW - 20 * MINUTE), "left", 10), status: "active" as const, endedAt: null }
    const today = todayWith({ activeFeed: running, lastFeed: running, recent: [{ kind: "feed", feed: running }] })
    const next = pendingToday(
      today,
      {
        kind: "addBottle",
        id: running.id,
        payload: { actionId: ACTION_ID, version: 1, occurredAt: NOW, breastMilkMl: 40, formulaMl: 20.5 },
      },
      pending,
    )
    expect(next.activeFeed?.portions.map(({ id }) => id)).toEqual([pendingId(ACTION_ID)])
    expect(next.recent).toHaveLength(1)
    expect(next.totals).toEqual({ ...NO_TOTALS, breastMilkMl: 40, formulaMl: 20.5, bottleMl: 60.5 })
  })

  it("leaves Today alone for a bottle meant for a feed it isn't showing", () => {
    const today = todayWith()
    const action = {
      kind: "addBottle" as const,
      id: "feed-elsewhere",
      payload: { actionId: ACTION_ID, version: 1, occurredAt: NOW, breastMilkMl: 40, formulaMl: 0 },
    }
    expect(pendingToday(today, action, pending)).toBe(today)
  })

  it("logs a bottle with no feed running as a finished feed at the bottle's time", () => {
    const bottle = { occurredAt: NOW - 10 * MINUTE, breastMilkMl: 40, formulaMl: 0 }
    const next = pendingToday(
      todayWith(),
      { kind: "logFeed", payload: { actionId: ACTION_ID, segments: [], portions: [bottle] } },
      pending,
    )
    expect(next.activeFeed).toBeNull()
    expect(next.lastFeed).toMatchObject({
      id: pendingId(ACTION_ID),
      status: "completed",
      startedAt: bottle.occurredAt,
      endedAt: bottle.occurredAt,
    })
    expect(next.totals).toEqual({ ...NO_TOTALS, feedsStarted: 1, breastMilkMl: 40, bottleMl: 40 })
  })

  it("counts a past feed's left and right sides in their own seconds", () => {
    const next = pendingToday(
      todayWith(),
      {
        kind: "logFeed",
        payload: {
          actionId: ACTION_ID,
          segments: [
            { side: "left", startedAt: NOW - 30 * MINUTE, endedAt: NOW - 20 * MINUTE },
            { side: "right", startedAt: NOW - 20 * MINUTE, endedAt: NOW - 12 * MINUTE },
          ],
          portions: [],
        },
      },
      pending,
    )
    expect(next.totals).toEqual({
      ...NO_TOTALS,
      feedsStarted: 1,
      leftSeconds: 600,
      rightSeconds: 480,
      nursingSeconds: 1080,
    })
  })

  it("leaves Today alone for a finish, which waits for the household", () => {
    const today = todayWith()
    const action = {
      kind: "finishFeed" as const,
      id: "feed-elsewhere",
      payload: { actionId: ACTION_ID, version: 1, occurredAt: NOW, deleteIfEmpty: false },
    }
    expect(pendingToday(today, action, pending)).toBe(today)
  })
})

describe("savedToday", () => {
  const start = {
    kind: "startFeed" as const,
    payload: { actionId: ACTION_ID, side: "left" as const, startedAt: NOW - 2 * MINUTE },
  }

  it("swaps the pending entry for the household's answer", () => {
    const action = {
      kind: "logDiaper" as const,
      payload: { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false },
    }
    const shown = pendingToday(todayWith(), action, pending)
    const diaper = diaperAt(NOW, { id: "diaper-1" })
    const next = savedToday(shown, { diaper, changed: [] }, action)
    expect(next.recent).toEqual([{ kind: "diaper", diaper }])
  })

  it("clears the running feed once it's finished, and keeps it as the last feed", () => {
    const running = { ...nursedFor(feedAt(NOW - 20 * MINUTE), "left", 10), status: "active" as const }
    const finished = { ...running, status: "completed" as const, version: 2 }
    const today = todayWith({ activeFeed: running, lastFeed: running, recent: [{ kind: "feed", feed: running }] })
    const action = {
      kind: "finishFeed" as const,
      id: running.id,
      payload: { actionId: ACTION_ID, version: 1, occurredAt: NOW, deleteIfEmpty: false },
    }
    const next = savedToday(today, { feed: finished, changed: [] }, action)
    expect(next.activeFeed).toBeNull()
    expect(next.lastFeed).toEqual(finished)
    expect(next.recent).toEqual([{ kind: "feed", feed: finished }])
  })

  it("drops an entry the household answers as deleted", () => {
    const feed = feedAt(NOW - 5 * MINUTE)
    const today = todayWith({ lastFeed: feed, recent: [{ kind: "feed", feed }] })
    const action = {
      kind: "deleteFeed" as const,
      id: feed.id,
      payload: { actionId: ACTION_ID, version: 1 },
    }
    const next = savedToday(today, { feed: { ...feed, deletedAt: NOW, version: 2 }, changed: [] }, action)
    expect(next.recent).toEqual([])
  })

  it("swaps a feed being started for the household's answer in the running, last and recent slots", () => {
    const started = pendingToday(todayWith(), start, pending)
    const answered = feedAt(NOW - 2 * MINUTE, {
      id: "feed-real",
      status: "active",
      endedAt: null,
      segments: [{ id: "feed-real-0", side: "left", startedAt: NOW - 2 * MINUTE, endedAt: null }],
    })
    const next = savedToday(started, { feed: answered, changed: [] }, start)
    expect(next.activeFeed).toEqual(answered)
    expect(next.lastFeed).toEqual(answered)
    expect(next.recent).toEqual([{ kind: "feed", feed: answered }])
  })

  it("keeps a feed being started running when another feed's deletion answers first", () => {
    const started = pendingToday(todayWith(), start, pending)
    const other = feedAt(NOW - 30 * MINUTE, { id: "feed-other" })
    const action = {
      kind: "deleteFeed" as const,
      id: other.id,
      payload: { actionId: OTHER_ACTION_ID, version: 1 },
    }
    const next = savedToday(started, { feed: { ...other, deletedAt: NOW, version: 2 }, changed: [] }, action)
    expect(next.activeFeed?.id).toBe(pendingId(ACTION_ID))
  })

  it("keeps a feed being started running when another feed's finish answers first", () => {
    const started = pendingToday(todayWith(), start, pending)
    const other = { ...nursedFor(feedAt(NOW - 30 * MINUTE, { id: "feed-other" }), "left", 10), version: 2 }
    const action = {
      kind: "finishFeed" as const,
      id: other.id,
      payload: { actionId: OTHER_ACTION_ID, version: 1, occurredAt: NOW - 20 * MINUTE, deleteIfEmpty: false },
    }
    const next = savedToday(started, { feed: other, changed: [] }, action)
    expect(next.activeFeed?.id).toBe(pendingId(ACTION_ID))
  })
})

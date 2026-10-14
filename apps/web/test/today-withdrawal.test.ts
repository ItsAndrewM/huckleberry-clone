import type { Today } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { pendingToday, withdrawnToday } from "../src/api/today-cache.ts"
import { ANDREW, feedAt, MINUTE, NOW, nursedFor, todayWith, ZONE } from "./today-fixtures.ts"

const pending = { by: ANDREW, now: NOW, zone: ZONE, supplements: [] }
const EARLIER = feedAt(NOW - 180 * MINUTE)
const TODAY = todayWith({
  totals: { ...todayWith().totals, feedsStarted: 1 },
  lastFeed: EARLIER,
  recent: [{ kind: "feed", feed: EARLIER }],
})

const DIAPER: Action = {
  kind: "logDiaper",
  payload: { actionId: "action-diaper", occurredAt: NOW - 5 * MINUTE, wet: true, dirty: true },
}

const BOTTLE: Action = {
  kind: "logFeed",
  payload: {
    actionId: "action-bottle",
    segments: [],
    portions: [{ occurredAt: NOW, breastMilkMl: 40, formulaMl: 20 }],
  },
}

const PAST_FEED: Action = {
  kind: "logFeed",
  payload: {
    actionId: "action-past-feed",
    segments: [{ side: "left", startedAt: NOW - 30 * MINUTE, endedAt: NOW - 20 * MINUTE }],
    portions: [],
  },
}

const START: Action = {
  kind: "startFeed",
  payload: { actionId: "action-start", side: "right", startedAt: NOW - 2 * MINUTE },
}

const shown = (today: Today, ...actions: ReadonlyArray<Action>) =>
  actions.reduce((current, action) => pendingToday(current, action, pending), today)

describe("withdrawnToday", () => {
  it("takes back the first save's entry and totals, leaving the second save's in place", () => {
    const both = shown(TODAY, DIAPER, BOTTLE)
    expect(withdrawnToday(both, DIAPER, pending, TODAY)).toEqual(shown(TODAY, BOTTLE))
  })

  it("takes back the second save's entry and totals, leaving the first save's in place", () => {
    const both = shown(TODAY, DIAPER, BOTTLE)
    expect(withdrawnToday(both, BOTTLE, pending, shown(TODAY, DIAPER))).toEqual(shown(TODAY, DIAPER))
  })

  it("hands the last feed back to the latest feed still shown, whichever save fails first", () => {
    const both = shown(TODAY, PAST_FEED, BOTTLE)
    const withoutBottle = withdrawnToday(both, BOTTLE, pending, shown(TODAY, PAST_FEED))
    expect(withoutBottle).toEqual(shown(TODAY, PAST_FEED))
    const withoutPastFeed = withdrawnToday(both, PAST_FEED, pending, TODAY)
    expect(withoutPastFeed).toEqual(shown(TODAY, BOTTLE))
    expect(withdrawnToday(withoutPastFeed, BOTTLE, pending, shown(TODAY, PAST_FEED))).toEqual(TODAY)
  })

  it("takes back a feed being started: nothing running, and the last feed as it was", () => {
    expect(withdrawnToday(shown(TODAY, START), START, pending, TODAY)).toEqual(TODAY)
  })

  it("takes back a bottle added to the running feed, leaving the feed as it was", () => {
    const running = { ...nursedFor(feedAt(NOW - 20 * MINUTE), "left", 10), status: "active" as const, endedAt: null }
    const today = todayWith({ activeFeed: running, lastFeed: running, recent: [{ kind: "feed", feed: running }] })
    const topUp: Action = {
      kind: "addBottle",
      id: running.id,
      payload: { actionId: "action-top-up", version: 1, occurredAt: NOW, breastMilkMl: 40, formulaMl: 0 },
    }
    expect(withdrawnToday(shown(today, topUp), topUp, pending, today)).toEqual(today)
  })

  it("leaves Today alone for a save that changed nothing optimistically", () => {
    const finish: Action = {
      kind: "finishFeed",
      id: EARLIER.id,
      payload: { actionId: "action-finish", version: 1, occurredAt: NOW, deleteIfEmpty: false },
    }
    expect(withdrawnToday(TODAY, finish, pending, TODAY)).toBe(TODAY)
  })

  it("leaves Today alone once a refetch has already replaced the entry, so totals aren't taken twice", () => {
    expect(withdrawnToday(TODAY, DIAPER, pending, TODAY)).toBe(TODAY)
    expect(withdrawnToday(TODAY, BOTTLE, pending, TODAY)).toBe(TODAY)
  })
})

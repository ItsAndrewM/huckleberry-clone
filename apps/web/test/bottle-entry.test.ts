import { describe, expect, it } from "vitest"
import { bottleAction, bottleSession, hasMilk } from "../src/features/feed/bottle-entry.ts"
import { feedAt, NOW, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const AMOUNTS = { breastMilkMl: 59.1, formulaMl: 0 }

describe("bottleSession", () => {
  it("starts from the household's last bottle, at Now", () => {
    const prefill = { lastBottle: AMOUNTS, lastSide: null }
    expect(bottleSession(null, prefill, ZONE)).toMatchObject({ ...AMOUNTS, when: { kind: "now" } })
  })

  it("starts empty when no bottle has been logged yet", () => {
    expect(bottleSession(null, undefined, ZONE)).toMatchObject({ breastMilkMl: 0, formulaMl: 0 })
  })

  it("reopens a bottle that wasn't saved with its amounts, time and actionId", () => {
    const payload = { actionId: ACTION_ID, version: 2, occurredAt: Date.UTC(2026, 9, 9, 16, 0), ...AMOUNTS }
    const failed = {
      sending: { sheet: "bottle" as const, action: { kind: "addBottle" as const, id: "feed-1", payload } },
      error: new Error(),
    }
    expect(bottleSession(failed, undefined, ZONE)).toEqual({
      actionId: ACTION_ID,
      ...AMOUNTS,
      when: { kind: "at", local: "2026-10-09T09:00", pick: null },
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

describe("hasMilk", () => {
  it("needs some milk, and both amounts readable", () => {
    expect(hasMilk(AMOUNTS)).toBe(true)
    expect(hasMilk({ breastMilkMl: 0, formulaMl: 0 })).toBe(false)
    expect(hasMilk({ breastMilkMl: null, formulaMl: 30 })).toBe(false)
  })
})

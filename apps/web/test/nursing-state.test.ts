import { describe, expect, it } from "vitest"
import { pendingId } from "../src/api/pending.ts"
import {
  controlsWait,
  finishAction,
  nursingState,
  resumeAction,
  timedAction,
} from "../src/features/feed/nursing-state.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { feedAt, MINUTE, NOW } from "./today-fixtures.ts"

const LEFT = { id: "s1", side: "left" as const, startedAt: NOW - 20 * MINUTE, endedAt: NOW - 10 * MINUTE }
const RIGHT = { id: "s2", side: "right" as const, startedAt: NOW - 10 * MINUTE, endedAt: null }
const running = { ...feedAt(NOW - 20 * MINUTE), status: "active" as const, endedAt: null, segments: [LEFT, RIGHT] }

describe("nursingState", () => {
  it("is idle with no feed running", () => {
    expect(nursingState(null)).toEqual({ kind: "idle" })
  })

  it("waits for a feed that's still being started", () => {
    expect(nursingState({ ...running, id: pendingId("4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a") })).toEqual({
      kind: "starting",
    })
  })

  it("is running on the side with no end, or paused on the side nursed last", () => {
    expect(nursingState(running)).toEqual({ kind: "running", feed: running, segment: RIGHT })
    const paused = { ...running, segments: [{ ...RIGHT, endedAt: NOW }, LEFT] }
    expect(nursingState(paused)).toEqual({ kind: "paused", feed: paused, lastSide: "right" })
  })
})

describe("the running feed's actions", () => {
  it("send the tap time and the feed's version, each with a new actionId", () => {
    const pause = timedAction("pauseFeed", { ...running, version: 4 }, NOW)
    const resume = resumeAction({ ...running, version: 5 }, "left", NOW)
    const finish = finishAction({ ...running, version: 6 }, NOW, true)
    expect(pause).toMatchObject({ kind: "pauseFeed", id: running.id, payload: { version: 4, occurredAt: NOW } })
    expect(resume).toMatchObject({ kind: "resumeFeed", payload: { version: 5, side: "left", occurredAt: NOW } })
    expect(finish).toMatchObject({ kind: "finishFeed", payload: { version: 6, occurredAt: NOW, deleteIfEmpty: true } })
    expect(new Set([pause, resume, finish].map(({ payload }) => payload.actionId)).size).toBe(3)
  })
})

const BOTTLE_ACTION_ID = "9d2e7c40-5b1a-4e3f-8a6d-0c4b7e1f2a93"

const PAUSING: Sending = { sheet: "nursing", action: timedAction("pauseFeed", running, NOW) }

const TOPPING_UP: Sending = {
  sheet: "bottle",
  action: {
    kind: "addBottle",
    id: running.id,
    payload: { actionId: BOTTLE_ACTION_ID, version: running.version, occurredAt: NOW, breastMilkMl: 0, formulaMl: 60 },
  },
}

describe("the running feed's controls", () => {
  it("wait while the Nursing sheet's own send is in flight", () => {
    expect(controlsWait(PAUSING, running)).toBe(true)
  })

  it("wait while a bottle from another sheet is still saving to the feed", () => {
    const topped = {
      ...running,
      portions: [{ id: pendingId(BOTTLE_ACTION_ID), occurredAt: NOW, breastMilkMl: 0, formulaMl: 60 }],
    }
    expect(controlsWait(TOPPING_UP, topped)).toBe(true)
  })

  it("are free when another sheet's send leaves the feed settled", () => {
    expect(controlsWait(TOPPING_UP, running)).toBe(false)
  })
})

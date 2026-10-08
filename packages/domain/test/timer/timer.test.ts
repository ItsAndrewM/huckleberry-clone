import { describe, expect, it } from "vitest"
import { formatElapsed, nursingElapsed, sleepElapsed } from "../../src/index.ts"
import { AC21_DST_SEGMENTS } from "../fixtures/scenarios.ts"

const T0 = Date.parse("2026-10-06T18:00:00Z")
const SECOND = 1000
const MINUTE = 60 * SECOND

describe("nursingElapsed", () => {
  const closed = [
    { startedAt: T0, endedAt: T0 + 15 * MINUTE },
    { startedAt: T0 + 15 * MINUTE, endedAt: T0 + 30 * MINUTE },
  ]

  it("sums closed segments", () => {
    expect(nursingElapsed(closed, T0 + 120 * MINUTE)).toBe(30 * 60)
  })

  it("counts the open segment up to now", () => {
    const running = [...closed, { startedAt: T0 + 40 * MINUTE, endedAt: null }]
    expect(nursingElapsed(running, T0 + 45 * MINUTE)).toBe(35 * 60)
  })

  it("stands still while paused, whatever the time", () => {
    expect(nursingElapsed(closed, T0 + 30 * MINUTE)).toBe(nursingElapsed(closed, T0 + 540 * MINUTE))
  })

  it("never goes negative when the phone's clock is behind the server's (AC 21)", () => {
    expect(nursingElapsed([{ startedAt: T0, endedAt: null }], T0 - 3 * SECOND)).toBe(0)
  })

  it("sums milliseconds before rounding down to whole seconds", () => {
    const halves = [
      { startedAt: T0, endedAt: T0 + 1500 },
      { startedAt: T0 + 2000, endedAt: T0 + 3500 },
    ]
    expect(nursingElapsed(halves, T0 + 4000)).toBe(3)
  })

  it.each(AC21_DST_SEGMENTS)("measures real time, not wall-clock time: $label (AC 21)", (segment) => {
    expect(nursingElapsed([segment], segment.endedAt)).toBe(20 * 60)
  })
})

describe("sleepElapsed", () => {
  it("counts a running session up to now", () => {
    expect(sleepElapsed({ startedAt: T0, endedAt: null }, T0 + 90 * MINUTE)).toBe(90 * 60)
  })

  it("stops at the wake time", () => {
    expect(sleepElapsed({ startedAt: T0, endedAt: T0 + 90 * MINUTE }, T0 + 300 * MINUTE)).toBe(90 * 60)
  })
})

describe("formatElapsed", () => {
  it.each([
    [0, "0:00"],
    [59, "0:59"],
    [61, "1:01"],
    [61.9, "1:01"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
    [25 * 3600 + 61, "25:01:01"],
    [-5, "0:00"],
  ])("%s seconds shows as %s", (seconds, text) => {
    expect(formatElapsed(seconds)).toBe(text)
  })
})

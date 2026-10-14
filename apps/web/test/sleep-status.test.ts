import { describe, expect, it } from "vitest"
import { sleepStatus } from "../src/features/today/sleep-status.ts"
import { MINUTE, NOW, sleptAt } from "./today-fixtures.ts"

describe("Today's sleep status", () => {
  it("counts a running sleep up to now", () => {
    const running = sleptAt(NOW - 42 * MINUTE, { endedAt: null })
    expect(sleepStatus({ activeSleep: running, lastSleep: running }, NOW)).toEqual({
      kind: "asleep",
      sleep: running,
      seconds: 42 * 60,
    })
  })

  it("counts the time since she woke from the last sleep", () => {
    const nap = sleptAt(NOW - 3 * 60 * MINUTE, { endedAt: NOW - 130 * MINUTE })
    expect(sleepStatus({ activeSleep: null, lastSleep: nap }, NOW)).toEqual({
      kind: "awake",
      sleep: nap,
      wokeAt: NOW - 130 * MINUTE,
      seconds: 130 * 60,
    })
  })

  it("says nothing yet before the first sleep", () => {
    expect(sleepStatus({ activeSleep: null, lastSleep: null }, NOW)).toEqual({ kind: "none" })
  })

  it("never counts below zero for a wake a phone logged ahead of the clock", () => {
    const ahead = sleptAt(NOW - 60 * MINUTE, { endedAt: NOW + 2 * MINUTE })
    expect(sleepStatus({ activeSleep: null, lastSleep: ahead }, NOW)).toMatchObject({ kind: "awake", seconds: 0 })
  })
})

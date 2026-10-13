import { describe, expect, it } from "vitest"
import { clockTime, dateClockTime, dayClockTime, formatterFor } from "../src/clock-time.ts"

const VANCOUVER = "America/Vancouver"
const FIVE_PAST_TWO_IN_VANCOUVER = Date.UTC(2026, 9, 8, 9, 5)

describe("formatterFor", () => {
  it("keeps one formatter for each format, zone and locale", () => {
    expect(formatterFor("time", VANCOUVER, "en-US")).toBe(formatterFor("time", VANCOUVER, "en-US"))
    expect(formatterFor("dateTime", VANCOUVER)).toBe(formatterFor("dateTime", VANCOUVER))
  })

  it("gives another zone, locale or format a formatter of its own", () => {
    const vancouver = formatterFor("time", VANCOUVER, "en-US")
    expect(formatterFor("time", "Europe/London", "en-US")).not.toBe(vancouver)
    expect(formatterFor("time", VANCOUVER, "en-GB")).not.toBe(vancouver)
    expect(formatterFor("time", VANCOUVER)).not.toBe(vancouver)
    expect(formatterFor("dayTime", VANCOUVER, "en-US")).not.toBe(vancouver)
  })

  it("still refuses a zone this phone doesn't know, every time", () => {
    expect(() => clockTime(FIVE_PAST_TWO_IN_VANCOUVER, "Not/AZone")).toThrow(RangeError)
    expect(() => clockTime(FIVE_PAST_TWO_IN_VANCOUVER, "Not/AZone")).toThrow(RangeError)
  })
})

describe("the clock times", () => {
  it("read as they did before the formatters were kept", () => {
    expect(clockTime(FIVE_PAST_TWO_IN_VANCOUVER, VANCOUVER, "en-US")).toMatch(/^2:05\sAM$/)
    expect(dayClockTime(FIVE_PAST_TWO_IN_VANCOUVER, VANCOUVER, "en-US")).toMatch(/^Thu 2:05\sAM$/)
    expect(dateClockTime(FIVE_PAST_TWO_IN_VANCOUVER, VANCOUVER, "en-US")).toMatch(/^Thu, Oct 8, 2:05\sAM$/)
  })
})

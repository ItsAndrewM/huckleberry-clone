import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { localDateTimeOf, resolveLocal, SLEEP_KINDS, sleepKindAt } from "../../src/index.ts"
import { LONDON, VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const atLocal = (local: string, zone: string) => {
  const resolved = resolveLocal(local, zone)
  if (resolved.kind !== "ok") throw new Error(`${local} isn't a single instant in ${zone}`)
  return resolved.instant
}

describe("sleepKindAt", () => {
  it("names the two kinds a sleep can be", () => {
    expect(SLEEP_KINDS).toEqual(["nap", "night"])
  })

  it.each([
    ["06:59", "night"],
    ["07:00", "nap"],
    ["12:30", "nap"],
    ["18:59", "nap"],
    ["19:00", "night"],
    ["23:30", "night"],
    ["00:00", "night"],
  ])("calls a sleep starting at %s the household's time a %s", (time, kind) => {
    expect(sleepKindAt(atLocal(`2026-10-08T${time}`, VANCOUVER), VANCOUVER)).toBe(kind)
  })

  it("reads the household's own clock, not UTC's", () => {
    const sevenThirtyInLondon = atLocal("2026-10-08T07:30", LONDON)
    expect(sleepKindAt(sevenThirtyInLondon, LONDON)).toBe("nap")
    expect(sleepKindAt(sevenThirtyInLondon, VANCOUVER)).toBe("night")
  })

  it("reads each pass of a repeated hour as the clock shows it, when the clocks go back", () => {
    const first = Date.parse("2025-11-02T08:30:00Z")
    const second = Date.parse("2025-11-02T09:30:00Z")
    expect([localDateTimeOf(first, VANCOUVER), localDateTimeOf(second, VANCOUVER)]).toEqual([
      "2025-11-02T01:30",
      "2025-11-02T01:30",
    ])
    expect([sleepKindAt(first, VANCOUVER), sleepKindAt(second, VANCOUVER)]).toEqual(["night", "night"])
  })

  it("is night exactly when the local hour is from 19 to 6, in every zone", () => {
    fc.assert(
      fc.property(zonedInstants, ([instant, zone]) => {
        const hour = Number(localDateTimeOf(instant, zone).slice(11, 13))
        expect(sleepKindAt(instant, zone)).toBe(hour >= 19 || hour < 7 ? "night" : "nap")
      }),
    )
  })
})

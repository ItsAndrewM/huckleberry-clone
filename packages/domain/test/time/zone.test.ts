import { describe, expect, it } from "vitest"
import { canonicalTimeZone, resolveLocal, startOfDate } from "../../src/index.ts"

describe("canonicalTimeZone", () => {
  it("accepts an IANA zone and returns its canonical spelling", () => {
    expect(canonicalTimeZone("America/Vancouver")).toBe("America/Vancouver")
    expect(canonicalTimeZone("america/vancouver")).toBe("America/Vancouver")
  })

  it.each(["Not/A_Zone", "Vancouver", ""])("rejects %j", (name) => {
    expect(canonicalTimeZone(name)).toBeNull()
  })

  it.each(["+05:30", "-07:00"])("rejects the fixed offset %s, which never observes DST", (name) => {
    expect(canonicalTimeZone(name)).toBeNull()
  })
})

describe("a zone that never went through canonicalTimeZone", () => {
  it.each(["Not/A_Zone", "constructor", "__proto__", "Not/A_Zone-05", "+05:30"])(
    "makes zone math throw on %j instead of returning NaN or guessing an offset",
    (zone) => {
      expect(() => resolveLocal("2026-10-06T12:00", zone)).toThrow(RangeError)
      expect(() => startOfDate("2026-10-06", zone)).toThrow(RangeError)
    },
  )
})

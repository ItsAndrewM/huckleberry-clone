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
  it("makes zone math throw instead of returning NaN", () => {
    expect(() => resolveLocal("2026-10-06T12:00", "Not/A_Zone")).toThrow(RangeError)
    expect(() => startOfDate("2026-10-06", "Not/A_Zone")).toThrow(RangeError)
  })
})

import { describe, expect, it } from "vitest"
import { ambiguity, NOW, resolveWhen, whenAt } from "../src/sheets/when.ts"

const ZONE = "America/Vancouver"
const at = (iso: string) => Date.parse(iso)
const NOON = at("2026-10-09T19:00:00Z")

describe("resolveWhen", () => {
  it("reads Now as the moment of the tap", () => {
    expect(resolveWhen(NOW, ZONE, NOON)).toEqual({ ok: true, instant: NOON })
  })

  it("reads a picked time on the household's clock, not the phone's", () => {
    expect(resolveWhen({ kind: "at", local: "2026-10-09T11:30", pick: null }, ZONE, NOON)).toEqual({
      ok: true,
      instant: at("2026-10-09T18:30:00Z"),
    })
    expect(resolveWhen({ kind: "at", local: "2026-10-09T11:30", pick: null }, "Europe/London", NOON)).toEqual({
      ok: true,
      instant: at("2026-10-09T10:30:00Z"),
    })
  })

  it("asks which 1:30 when the clocks go back, then takes the one picked", () => {
    const local = "2025-11-02T01:30"
    const later = at("2025-11-02T12:00:00Z")
    expect(resolveWhen({ kind: "at", local, pick: null }, ZONE, later)).toEqual({ ok: false, issue: "ambiguous" })
    expect(resolveWhen({ kind: "at", local, pick: "earlier" }, ZONE, later)).toEqual({
      ok: true,
      instant: at("2025-11-02T08:30:00Z"),
    })
    expect(resolveWhen({ kind: "at", local, pick: "later" }, ZONE, later)).toEqual({
      ok: true,
      instant: at("2025-11-02T09:30:00Z"),
    })
  })

  it("refuses a time the clocks skipped when they went forward", () => {
    const local = "2026-03-08T02:30"
    expect(resolveWhen({ kind: "at", local, pick: null }, ZONE, NOON)).toEqual({ ok: false, issue: "nonexistent" })
  })

  it("refuses a cleared field and a time more than five minutes ahead", () => {
    expect(resolveWhen({ kind: "at", local: "", pick: null }, ZONE, NOON)).toEqual({ ok: false, issue: "unreadable" })
    expect(resolveWhen({ kind: "at", local: "2026-10-09T12:06", pick: null }, ZONE, NOON)).toEqual({
      ok: false,
      issue: "in_future",
    })
  })

  it("refuses a time before the earliest allowed, but reads the earliest's own minute as the earliest itself", () => {
    const sideStarted = at("2026-10-09T18:31:17Z")
    const before = { kind: "at" as const, local: "2026-10-09T11:30", pick: null }
    const sameMinute = { kind: "at" as const, local: "2026-10-09T11:31", pick: null }
    expect(resolveWhen(before, ZONE, NOON, sideStarted)).toEqual({ ok: false, issue: "too_early" })
    expect(resolveWhen(sameMinute, ZONE, NOON, sideStarted)).toEqual({ ok: true, instant: sideStarted })
  })
})

describe("whenAt", () => {
  it("shows an instant on the household's clock, remembering which 1:30 it was", () => {
    expect(whenAt(at("2026-10-09T18:30:45Z"), ZONE)).toEqual({ kind: "at", local: "2026-10-09T11:30", pick: null })
    expect(whenAt(at("2025-11-02T08:30:00Z"), ZONE)).toEqual({
      kind: "at",
      local: "2025-11-02T01:30",
      pick: "earlier",
    })
    expect(whenAt(at("2025-11-02T09:30:00Z"), ZONE)).toEqual({ kind: "at", local: "2025-11-02T01:30", pick: "later" })
  })
})

describe("ambiguity", () => {
  it("offers both instants only for a local time that happened twice", () => {
    expect(ambiguity({ kind: "at", local: "2025-11-02T01:30", pick: null }, ZONE)).toEqual({
      kind: "ambiguous",
      earlier: at("2025-11-02T08:30:00Z"),
      later: at("2025-11-02T09:30:00Z"),
    })
    expect(ambiguity({ kind: "at", local: "2025-11-02T03:30", pick: null }, ZONE)).toBeNull()
    expect(ambiguity(NOW, ZONE)).toBeNull()
  })
})

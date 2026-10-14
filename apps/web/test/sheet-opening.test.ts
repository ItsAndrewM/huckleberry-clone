import { describe, expect, it } from "vitest"
import { type Opening, openingAt } from "../src/sheets/use-opening.ts"

describe("openingAt", () => {
  const OPENED: Opening<string | null> = { opened: 3, value: "supplement-1" }

  it("keeps what a sheet opened on through that opening, though closing clears what it shows", () => {
    expect(openingAt(OPENED, 3, null)).toBe(OPENED)
  })

  it("takes what the next opening shows", () => {
    expect(openingAt(OPENED, 4, "supplement-2")).toEqual({ opened: 4, value: "supplement-2" })
    expect(openingAt(OPENED, 4, null)).toEqual({ opened: 4, value: null })
  })
})

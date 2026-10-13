import { describe, expect, it } from "vitest"
import { historySearchOf } from "../src/features/trends/history-link.ts"
import { TODAY } from "./trends-fixtures.ts"

describe("historySearchOf", () => {
  it("opens History's today with no date, so it follows midnight, and any other day by its date", () => {
    expect(historySearchOf(TODAY, TODAY)).toEqual({})
    expect(historySearchOf("2026-10-13", TODAY)).toEqual({ date: "2026-10-13" })
  })
})

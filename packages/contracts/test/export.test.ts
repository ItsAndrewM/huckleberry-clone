import { describe, expect, it } from "vitest"
import { type HouseholdExport, householdExportFrom } from "../src/index.ts"

const EXPORTED: HouseholdExport = {
  format: "baby-tracker-export",
  version: 1,
  exportedAt: Date.UTC(2026, 9, 12, 3, 14),
  migrations: ["0001-household"],
  tables: { diapers: [{ id: "d1", wet: 1, weight: 4310.5, deleted_at: null }] },
}

describe("householdExportFrom", () => {
  it("reads an export, whose cells are text, numbers or null", () => {
    expect(householdExportFrom(JSON.stringify(EXPORTED))).toEqual(EXPORTED)
  })

  it.each([
    ["text that isn't JSON", "{"],
    ["another format", JSON.stringify({ ...EXPORTED, format: "huckleberry" })],
    ["a version this app can't read", JSON.stringify({ ...EXPORTED, version: 2 })],
    ["a cell holding an object", JSON.stringify({ ...EXPORTED, tables: { diapers: [{ id: { nested: true } }] } })],
    ["a table that isn't a list", JSON.stringify({ ...EXPORTED, tables: { diapers: { id: "d1" } } })],
  ])("answers null for %s", (_label, json) => {
    expect(householdExportFrom(json)).toBeNull()
  })
})

import { describe, expect, it } from "vitest"
import { childOf, householdOf } from "../src/core/household.ts"
import { inHousehold } from "./fixtures.ts"

describe("the household and child tables", () => {
  it("start a seeded household in mL, kg and cm, with the household and child at version 1, edited by no one", async () => {
    const { household, child } = await inHousehold((sql) => ({ household: householdOf(sql), child: childOf(sql) }))
    expect(household).toMatchObject({
      units: { volume: "ml", weight: "kg", length: "cm" },
      version: 1,
      updatedBy: null,
    })
    expect(child).toMatchObject({ version: 1, updatedBy: null })
  })

  it.each([
    ["a volume unit", "UPDATE household SET volume_unit = 'oz'"],
    ["a weight unit", "UPDATE household SET weight_unit = 'lb'"],
    ["a length unit", "UPDATE household SET length_unit = 'mm'"],
    ["a household version", "UPDATE household SET version = 0"],
    ["a child version", "UPDATE child SET version = 0"],
  ])("refuse %s outside its choices", async (_label, update) => {
    await inHousehold((sql) => {
      expect(() => sql.exec(update)).toThrow("CHECK constraint failed")
    })
  })

  it.each(["household", "child"])("let only a caregiver have edited the %s", async (table) => {
    await inHousehold((sql) => {
      expect(() => sql.exec(`UPDATE ${table} SET updated_by = 'nobody'`)).toThrow("FOREIGN KEY constraint failed")
    })
  })
})

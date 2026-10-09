import { env, runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { seedHousehold } from "../src/core/household.ts"
import { startHousehold } from "../src/household.ts"
import { ANDREW, EMILY, newHousehold, SEED } from "./fixtures.ts"

describe("seeding a household", () => {
  it("creates it once, then reports the stored one and changes nothing", async () => {
    const household = newHousehold()
    expect(await household.seedHousehold(SEED)).toEqual({ created: true, household: SEED })
    const again = await household.seedHousehold({ ...SEED, name: "Another name" })
    expect(again).toEqual({ created: false, household: SEED })
  })

  it("stores the canonical name of the time zone", async () => {
    const { household } = await newHousehold().seedHousehold({ ...SEED, timeZone: "US/Pacific" })
    expect(household.timeZone).toBe("America/Los_Angeles")
  })

  it("writes all of it or none of it", async () => {
    const household = newHousehold()
    const shouting = { ...EMILY, email: "Emily@Example.test" }
    await runInDurableObject(household, (_instance, state) => {
      expect(() => seedHousehold(state.storage, { ...SEED, caregivers: [ANDREW, shouting] }, Date.now())).toThrow(
        /CHECK constraint failed/,
      )
    })
    expect(await household.seedHousehold(SEED)).toMatchObject({ created: true })
  })
})

describe("starting a household", () => {
  const LOCAL = {
    name: "Local household",
    timeZone: "America/Vancouver",
    caregivers: [{ email: "andrew@example.test", displayName: "Andrew (local)" }],
    child: { name: "Robin", birthDate: "2026-09-01", sex: "female", gestationalAgeDays: 281 },
  }

  it("seeds LOCAL_HOUSEHOLD, once, so a local run can sign in as the access.dev identity", async () => {
    const stored = await runInDurableObject(newHousehold(), async (_instance, state) => {
      await startHousehold(state.storage, LOCAL, Date.now())
      await startHousehold(state.storage, { ...LOCAL, name: "Renamed" }, Date.now())
      return {
        household: state.storage.sql.exec("SELECT name FROM household").toArray(),
        caregivers: state.storage.sql.exec("SELECT email, display_name FROM caregivers").toArray(),
      }
    })
    expect(stored).toEqual({
      household: [{ name: "Local household" }],
      caregivers: [{ email: "andrew@example.test", display_name: "Andrew (local)" }],
    })
  })

  it("refuses to start with a LOCAL_HOUSEHOLD that isn't a valid seed", async () => {
    await runInDurableObject(newHousehold(), async (_instance, state) => {
      await expect(startHousehold(state.storage, { ...LOCAL, caregivers: [] }, Date.now())).rejects.toThrow(
        "caregivers",
      )
    })
  })

  it("has no LOCAL_HOUSEHOLD in the configuration that deploys", () => {
    expect(env).not.toHaveProperty("LOCAL_HOUSEHOLD")
  })
})

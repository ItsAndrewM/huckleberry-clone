import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import type { HouseholdDO } from "../src/household.ts"
import { newHousehold, SEED, seededHousehold } from "./fixtures.ts"

const get = (household: DurableObjectStub<HouseholdDO>, path: string, email?: string) =>
  household.fetch(`https://bt.example.test${path}`, email === undefined ? {} : { headers: { "x-bt-email": email } })

describe("GET /api/me", () => {
  it("tells an active caregiver who they are, and their household and child", async () => {
    const response = await get(await seededHousehold(), "/api/me", "emily@example.test")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      caregiver: { id: expect.any(String), email: "emily@example.test", displayName: "Emily" },
      household: { name: "Test household", timeZone: "America/Vancouver" },
      child: { name: "Robin", birthDate: "2026-09-01" },
    })
  })

  it("shows the household's time zone as stored, by its canonical name", async () => {
    const household = await seededHousehold({ ...SEED, timeZone: "US/Pacific" })
    expect(await (await get(household, "/api/me", "andrew@example.test")).json()).toMatchObject({
      household: { timeZone: "America/Los_Angeles" },
    })
  })

  it.each([
    ["an email that isn't a caregiver", "stranger@example.test"],
    ["no x-bt-email at all", undefined],
  ])("refuses %s with 401", async (_label, email) => {
    const response = await get(await seededHousehold(), "/api/me", email)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })

  it("refuses a caregiver from the next request after they're disabled, and only them", async () => {
    const household = await seededHousehold()
    await runInDurableObject(household, (_instance, state) => {
      state.storage.sql.exec("UPDATE caregivers SET active = 0 WHERE email = 'andrew@example.test'")
    })
    expect((await get(household, "/api/me", "andrew@example.test")).status).toBe(401)
    expect((await get(household, "/api/me", "emily@example.test")).status).toBe(200)
  })

  it("refuses everyone before the household is seeded", async () => {
    expect((await get(newHousehold(), "/api/me", "andrew@example.test")).status).toBe(401)
  })
})

describe("the household's HTTP routes", () => {
  it("answer an unknown /api path with the contract's 404", async () => {
    const response = await get(await seededHousehold(), "/api/nothing-here", "andrew@example.test")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ _tag: "NotFound" })
  })

  it.each([
    ["a caregiver's answer", "andrew@example.test"],
    ["a refusal", "stranger@example.test"],
  ])("mark %s no-store", async (_label, email) => {
    const response = await get(await seededHousehold(), "/api/me", email)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})

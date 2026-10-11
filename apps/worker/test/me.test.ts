import { runInDurableObject } from "cloudflare:test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ANDREW, caregiverId, EMILY, newHousehold, SEED, seededHousehold } from "./fixtures.ts"
import { get, inStorage } from "./requests.ts"

describe("GET /api/me", () => {
  it("tells an active caregiver who they are, and their household and child as Settings edits them", async () => {
    const response = await get(await seededHousehold(), "/api/me", "emily@example.test")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      caregiver: { id: expect.any(String), email: "emily@example.test", displayName: "Emily" },
      household: {
        name: "Test household",
        timeZone: "America/Vancouver",
        units: { volume: "ml", weight: "kg", length: "cm" },
        version: 1,
        updatedBy: null,
        updatedAt: expect.any(Number),
        caregivers: [
          { id: expect.any(String), displayName: "Andrew" },
          { id: expect.any(String), displayName: "Emily" },
        ],
      },
      child: {
        name: "Robin",
        birthDate: "2026-09-01",
        sex: "female",
        gestationalAgeDays: 281,
        version: 1,
        updatedBy: null,
        updatedAt: expect.any(Number),
      },
    })
  })

  it("names every caregiver by the id records carry, including one who's been disabled", async () => {
    const household = await seededHousehold()
    expect(await household.disableCaregiver(ANDREW.email)).toMatchObject({ active: false })
    const ids = await inStorage(household, (sql) => ({
      andrew: caregiverId(sql, ANDREW.email),
      emily: caregiverId(sql, EMILY.email),
    }))
    expect(await (await get(household, "/api/me", EMILY.email)).json()).toMatchObject({
      household: {
        caregivers: [
          { id: ids.andrew, displayName: "Andrew" },
          { id: ids.emily, displayName: "Emily" },
        ],
      },
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
    expect((await get(household, "/api/me", "andrew@example.test")).status).toBe(200)
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
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("answer an unknown /api path with the contract's 404", async () => {
    const response = await get(await seededHousehold(), "/api/nothing-here", "andrew@example.test")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ _tag: "NotFound" })
  })

  it.each([
    ["a caregiver's answer", "andrew@example.test"],
    ["a refusal", "stranger@example.test"],
  ])("mark %s no-store, and log no error", async (_label, email) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = await get(await seededHousehold(), "/api/me", email)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(consoleError).not.toHaveBeenCalled()
  })

  it("logs a response it can't encode as a defect, instead of blaming the caller's input", async () => {
    const household = await seededHousehold()
    await runInDurableObject(household, (_instance, state) => {
      state.storage.sql.exec("UPDATE child SET birth_date = 'soon'")
    })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = await get(household, "/api/me", "andrew@example.test")
    expect(response.status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith(expect.any(Error))
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ event: "defect", route: "GET /api/me" }))
  })

  it("logs a defect it can't handle, and still answers 500 no-store", async () => {
    const household = await seededHousehold()
    await runInDurableObject(household, (_instance, state) => {
      state.storage.sql.exec("DELETE FROM child")
    })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = await get(household, "/api/me", "andrew@example.test")
    expect(response.status).toBe(500)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(consoleError).toHaveBeenCalledWith(expect.any(Error))
  })
})

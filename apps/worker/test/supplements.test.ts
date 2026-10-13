import { Me, SavedSupplement } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, EMILY, NOW, seededHousehold } from "./fixtures.ts"
import { type Household, get, inStorage, send, sendJson } from "./requests.ts"

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedSupplement))
const decodeMe = Schema.decodeUnknownSync(Schema.toCodecJson(Me))

const iron = () => ({ actionId: crypto.randomUUID(), name: "Iron", dose: "1 mL" })

const caregiverId = (household: Household, email: string) =>
  inStorage(household, (sql) => sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id)

const added = async (household: Household) =>
  decodeSaved((await sendJson(household, "POST", "/api/supplements", iron())).body).supplement

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/supplements", () => {
  it("adds a supplement and answers 201, no-store, with it and the key it changed", async () => {
    const household = await seededHousehold()
    const response = await send(household, "POST", "/api/supplements", JSON.stringify(iron()))
    const andrew = await caregiverId(household, ANDREW.email)
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      supplement: {
        id: expect.any(String),
        name: "Iron",
        dose: "1 mL",
        stoppedAt: null,
        version: 1,
        createdBy: andrew,
        createdAt: NOW,
        updatedBy: andrew,
        updatedAt: NOW,
      },
      changed: [["me"]],
    })
  })

  it("answers a retry with the same answer, and adds the supplement once", async () => {
    const household = await seededHousehold()
    const request = iron()
    const first = await sendJson(household, "POST", "/api/supplements", request)
    expect(await sendJson(household, "POST", "/api/supplements", request)).toEqual(first)
    const me = decodeMe(await (await get(household, "/api/me", ANDREW.email)).json())
    expect(me.household.supplements.map(({ name }) => name)).toEqual(["Vitamin D", "Iron"])
  })

  it("answers 400 naming name for a name that's empty", async () => {
    expect(await sendJson(await seededHousehold(), "POST", "/api/supplements", { ...iron(), name: "" })).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "name", issue: "invalid" }] },
    })
  })
})

describe("PATCH /api/supplements/:id", () => {
  it("renames, re-doses and stops a supplement, answering it as the next version", async () => {
    const household = await seededHousehold()
    const supplement = await added(household)
    const edit = { actionId: crypto.randomUUID(), version: 1, name: "Iron drops", dose: "0.5 mL", stopped: true }
    const emily = await caregiverId(household, EMILY.email)
    expect(await sendJson(household, "PATCH", `/api/supplements/${supplement.id}`, edit, EMILY.email)).toEqual({
      status: 200,
      body: {
        supplement: {
          ...supplement,
          name: "Iron drops",
          dose: "0.5 mL",
          stoppedAt: NOW,
          version: 2,
          updatedBy: emily,
          updatedAt: NOW,
        },
        changed: [["me"]],
      },
    })
  })

  it("answers 409 STALE_VERSION with the supplement as it is now", async () => {
    const household = await seededHousehold()
    const supplement = await added(household)
    const stale = { actionId: crypto.randomUUID(), version: 3, name: "Iron", dose: "1 mL", stopped: false }
    expect(await sendJson(household, "PATCH", `/api/supplements/${supplement.id}`, stale)).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "STALE_VERSION", current: supplement },
    })
  })

  it("answers 404 for a supplement the household doesn't hold", async () => {
    const edit = { actionId: crypto.randomUUID(), version: 1, name: "Iron", dose: "1 mL", stopped: false }
    expect(await sendJson(await seededHousehold(), "PATCH", "/api/supplements/no-such-supplement", edit)).toEqual({
      status: 404,
      body: { _tag: "NotFound" },
    })
  })
})

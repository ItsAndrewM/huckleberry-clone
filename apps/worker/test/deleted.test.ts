import { Deleted, SavedDiaper } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, EMILY, minutesAgo, NOW, SEED, SEP_3_BEGINS, seededHousehold } from "./fixtures.ts"
import { get, type Household, sendJson } from "./requests.ts"

const decodeDeleted = Schema.decodeUnknownSync(Schema.toCodecJson(Deleted))
const decodeSavedDiaper = Schema.decodeUnknownSync(Schema.toCodecJson(SavedDiaper))

const okDeleted = async (household: Household) => {
  const response = await get(household, "/api/deleted", ANDREW.email)
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  return decodeDeleted(await response.json())
}

const loggedDiaper = async (household: Household) => {
  const logging = { actionId: crypto.randomUUID(), occurredAt: minutesAgo(10), wet: true, dirty: false }
  return decodeSavedDiaper((await sendJson(household, "POST", "/api/diapers", logging)).body).diaper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/deleted", () => {
  it("answers 200, no-store, with nothing deleted yet", async () => {
    expect(await okDeleted(await seededHousehold())).toEqual({ feeds: [], diapers: [], measurements: [] })
  })

  it("lists a diaper the other parent deleted, as the delete answered it", async () => {
    const household = await seededHousehold()
    const logged = await loggedDiaper(household)
    const deleting = { actionId: crypto.randomUUID(), version: logged.version }
    const answer = await sendJson(household, "DELETE", `/api/diapers/${logged.id}`, deleting, EMILY.email)
    expect((await okDeleted(household)).diapers).toEqual([decodeSavedDiaper(answer.body).diaper])
  })

  it("leaves a restored diaper off the list", async () => {
    const household = await seededHousehold()
    const logged = await loggedDiaper(household)
    const path = `/api/diapers/${logged.id}`
    await sendJson(household, "DELETE", path, { actionId: crypto.randomUUID(), version: 1 })
    const restoring = await sendJson(household, "POST", `${path}/restore`, {
      actionId: crypto.randomUUID(),
      version: 2,
    })
    expect(restoring.status).toBe(200)
    expect((await okDeleted(household)).diapers).toEqual([])
  })

  it("keeps a diaper from before her birth date on the list, and answers its restore with 400 before_birth", async () => {
    const household = await seededHousehold()
    const logging = { actionId: crypto.randomUUID(), occurredAt: SEP_3_BEGINS, wet: true, dirty: false }
    const logged = decodeSavedDiaper((await sendJson(household, "POST", "/api/diapers", logging)).body).diaper
    await sendJson(household, "DELETE", `/api/diapers/${logged.id}`, { actionId: crypto.randomUUID(), version: 1 })
    const moving = { actionId: crypto.randomUUID(), version: 1, ...SEED.child, birthDate: "2026-09-04" }
    expect((await sendJson(household, "PATCH", "/api/child", moving)).status).toBe(200)
    const restoring = { actionId: crypto.randomUUID(), version: 2 }
    expect(await sendJson(household, "POST", `/api/diapers/${logged.id}/restore`, restoring)).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "occurredAt", issue: "before_birth" }] },
    })
    expect((await okDeleted(household)).diapers.map(({ id }) => id)).toEqual([logged.id])
  })

  it("refuses a stranger with 401", async () => {
    const response = await get(await seededHousehold(), "/api/deleted", "stranger@example.test")
    expect(response.status).toBe(401)
  })
})

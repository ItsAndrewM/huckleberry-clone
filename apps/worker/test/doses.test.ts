import { Me, SavedDose } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, CHANGED_TODAY, EMILY, HOUR_MS, MINUTE_MS, NOW, seededHousehold } from "./fixtures.ts"
import { type Household, get, inStorage, send, sendJson, sha256 } from "./requests.ts"

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedDose))
const decodeMe = Schema.decodeUnknownSync(Schema.toCodecJson(Me))

const vitaminDOf = async (household: Household) => {
  const [vitaminD] = decodeMe(await (await get(household, "/api/me", ANDREW.email)).json()).household.supplements
  if (vitaminD === undefined) throw new Error("expected the seeded Vitamin D")
  return vitaminD.id
}

const doseAt = (supplementId: string, occurredAt: number, confirmedDuplicate = false) => ({
  actionId: crypto.randomUUID(),
  supplementId,
  occurredAt,
  confirmedDuplicate,
})

const logged = async (household: Household, occurredAt = NOW - HOUR_MS) =>
  decodeSaved((await sendJson(household, "POST", "/api/doses", doseAt(await vitaminDOf(household), occurredAt))).body)
    .dose

const caregiverId = (household: Household, email: string) =>
  inStorage(household, (sql) => sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id)

const doseRows = (household: Household) =>
  inStorage(household, (sql) => sql.exec("SELECT id FROM supplement_logs").toArray())

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/doses", () => {
  it("logs a dose and answers 201, no-store, with it and the keys it changed", async () => {
    const household = await seededHousehold()
    const vitaminD = await vitaminDOf(household)
    const response = await send(household, "POST", "/api/doses", JSON.stringify(doseAt(vitaminD, NOW - HOUR_MS)))
    const andrew = await caregiverId(household, ANDREW.email)
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      dose: {
        id: expect.any(String),
        supplementId: vitaminD,
        occurredAt: NOW - HOUR_MS,
        localDate: "2026-10-08",
        dose: "400 IU",
        version: 1,
        createdBy: andrew,
        createdAt: NOW,
        updatedBy: andrew,
        updatedAt: NOW,
        deletedAt: null,
      },
      changed: CHANGED_TODAY,
    })
  })

  it("answers 409 SUPPLEMENT_DUPLICATE_DAY with the day's dose for a second one, then logs it once confirmed", async () => {
    const household = await seededHousehold()
    const first = await logged(household, NOW - 3 * HOUR_MS)
    const vitaminD = await vitaminDOf(household)
    expect(await sendJson(household, "POST", "/api/doses", doseAt(vitaminD, NOW - MINUTE_MS), EMILY.email)).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "SUPPLEMENT_DUPLICATE_DAY", current: first },
    })
    const confirmed = await sendJson(household, "POST", "/api/doses", doseAt(vitaminD, NOW - MINUTE_MS, true))
    expect(confirmed.status).toBe(201)
    expect(await doseRows(household)).toHaveLength(2)
  })

  it("lets only one of two phones' doses that day through unasked when both log at the same moment", async () => {
    const household = await seededHousehold()
    const vitaminD = await vitaminDOf(household)
    const statuses = await Promise.all([
      sendJson(household, "POST", "/api/doses", doseAt(vitaminD, NOW - MINUTE_MS), ANDREW.email),
      sendJson(household, "POST", "/api/doses", doseAt(vitaminD, NOW - MINUTE_MS), EMILY.email),
    ])
    expect(statuses.map(({ status }) => status).toSorted()).toEqual([201, 409])
    expect(await doseRows(household)).toHaveLength(1)
  })

  it("answers a retry of a save whose answer was lost with the stored 201, and keeps one dose (AC 14)", async () => {
    const household = await seededHousehold()
    const dose = doseAt(await vitaminDOf(household), NOW - HOUR_MS)
    const first = await sendJson(household, "POST", "/api/doses", dose)
    vi.setSystemTime(NOW + 30_000)
    expect(await sendJson(household, "POST", "/api/doses", dose)).toEqual(first)
    expect(await doseRows(household)).toHaveLength(1)
  })

  it("answers a retry with another time with 409 ACTION_REPLAY_MISMATCH and the saved dose", async () => {
    const household = await seededHousehold()
    const dose = doseAt(await vitaminDOf(household), NOW - HOUR_MS)
    const first = decodeSaved((await sendJson(household, "POST", "/api/doses", dose)).body)
    expect(await sendJson(household, "POST", "/api/doses", { ...dose, occurredAt: NOW - 2 * HOUR_MS })).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first.dose },
    })
  })

  it("saves a dose of a stopped supplement, sent by a phone that hadn't heard it was stopped (P6)", async () => {
    const household = await seededHousehold()
    const vitaminD = await vitaminDOf(household)
    const stop = { actionId: crypto.randomUUID(), version: 1, name: "Vitamin D", dose: "400 IU", stopped: true }
    expect((await sendJson(household, "PATCH", `/api/supplements/${vitaminD}`, stop, EMILY.email)).status).toBe(200)
    expect((await sendJson(household, "POST", "/api/doses", doseAt(vitaminD, NOW - HOUR_MS))).status).toBe(201)
    expect(await doseRows(household)).toHaveLength(1)
  })

  it("answers 404 for a supplement the household doesn't hold, and 400 naming each bad field", async () => {
    const household = await seededHousehold()
    expect(await sendJson(household, "POST", "/api/doses", doseAt("no-such-supplement", NOW))).toEqual({
      status: 404,
      body: { _tag: "NotFound" },
    })
    const bad = { ...doseAt(await vitaminDOf(household), NOW), occurredAt: "now", confirmedDuplicate: "no" }
    expect(await sendJson(household, "POST", "/api/doses", bad)).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "occurredAt", issue: "invalid" },
          { path: "confirmedDuplicate", issue: "invalid" },
        ],
      },
    })
  })
})

describe("PATCH, DELETE and POST …/restore", () => {
  it("move, delete and restore a dose, each answering with it and the keys it changed", async () => {
    const household = await seededHousehold()
    const dose = await logged(household)
    const path = `/api/doses/${dose.id}`
    const emily = await caregiverId(household, EMILY.email)
    const moved = { ...dose, occurredAt: NOW - 2 * HOUR_MS, version: 2, updatedBy: emily }
    const edit = { actionId: crypto.randomUUID(), version: 1, occurredAt: NOW - 2 * HOUR_MS }
    expect(await sendJson(household, "PATCH", path, edit, EMILY.email)).toEqual({
      status: 200,
      body: { dose: moved, changed: CHANGED_TODAY },
    })
    const deleted = { ...moved, version: 3, updatedBy: dose.createdBy, deletedAt: NOW }
    expect(await sendJson(household, "DELETE", path, { actionId: crypto.randomUUID(), version: 2 })).toEqual({
      status: 200,
      body: { dose: deleted, changed: [...CHANGED_TODAY, ["deleted"]] },
    })
    expect(await sendJson(household, "POST", `${path}/restore`, { actionId: crypto.randomUUID(), version: 3 })).toEqual(
      {
        status: 200,
        body: { dose: { ...deleted, version: 4, deletedAt: null }, changed: [...CHANGED_TODAY, ["deleted"]] },
      },
    )
  })

  it("answers 409 STALE_VERSION with the dose as it is now for a move from an old version", async () => {
    const household = await seededHousehold()
    const dose = await logged(household)
    const move = (occurredAt: number) => ({ actionId: crypto.randomUUID(), version: 1, occurredAt })
    const first = decodeSaved((await sendJson(household, "PATCH", `/api/doses/${dose.id}`, move(NOW - MINUTE_MS))).body)
    expect(await sendJson(household, "PATCH", `/api/doses/${dose.id}`, move(NOW), EMILY.email)).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "STALE_VERSION", current: first.dose },
    })
  })

  it("answers 404 for a dose the household doesn't hold", async () => {
    const response = await sendJson(await seededHousehold(), "DELETE", "/api/doses/no-such-dose", {
      actionId: crypto.randomUUID(),
      version: 1,
    })
    expect(response).toEqual({ status: 404, body: { _tag: "NotFound" } })
  })
})

describe("the receipts the dose endpoints keep", () => {
  it("hold each request's route and the hash of its canonical body, which a retry sent before a deploy must still match", async () => {
    const household = await seededHousehold()
    const vitaminD = await vitaminDOf(household)
    const logging = crypto.randomUUID()
    const moving = crypto.randomUUID()
    const deleting = crypto.randomUUID()
    const restoring = crypto.randomUUID()
    const at = NOW - HOUR_MS
    const movedTo = NOW - 2 * HOUR_MS
    const posted = { confirmedDuplicate: false, occurredAt: at, supplementId: vitaminD, actionId: logging }
    const { dose } = decodeSaved((await sendJson(household, "POST", "/api/doses", posted)).body)
    const path = `/api/doses/${dose.id}`
    await sendJson(household, "PATCH", path, { occurredAt: movedTo, version: 1, actionId: moving })
    await sendJson(household, "DELETE", path, { version: 2, actionId: deleting })
    await sendJson(household, "POST", `${path}/restore`, { version: 3, actionId: restoring })
    const receipts = await inStorage(household, (sql) =>
      sql.exec("SELECT action_id, route, request_hash FROM receipts ORDER BY rowid").toArray(),
    )
    expect(receipts).toEqual([
      {
        action_id: logging,
        route: "POST /api/doses",
        request_hash: await sha256(
          `POST /api/doses\n{"actionId":"${logging}","supplementId":"${vitaminD}","occurredAt":${at},"confirmedDuplicate":false}`,
        ),
      },
      {
        action_id: moving,
        route: `PATCH ${path}`,
        request_hash: await sha256(`PATCH ${path}\n{"actionId":"${moving}","version":1,"occurredAt":${movedTo}}`),
      },
      {
        action_id: deleting,
        route: `DELETE ${path}`,
        request_hash: await sha256(`DELETE ${path}\n{"actionId":"${deleting}","version":2}`),
      },
      {
        action_id: restoring,
        route: `POST ${path}/restore`,
        request_hash: await sha256(`POST ${path}/restore\n{"actionId":"${restoring}","version":3}`),
      },
    ])
  })
})

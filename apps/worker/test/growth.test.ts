import { SavedMeasurement } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, CHANGED_TODAY, EMILY, HOUR_MS, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, inStorage, send, sendJson, sha256 } from "./requests.ts"

const CHANGED_GROWTH = [...CHANGED_TODAY, ["growth"]]
const NO_METRICS = { weightG: null, lengthCm: null, headCm: null }

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedMeasurement))

const weighedAt = (measuredAt: number, weightG = 4210.5) => ({
  actionId: crypto.randomUUID(),
  measuredAt,
  ...NO_METRICS,
  weightG,
})

const logged = async (household: Household, measuredAt = NOW - HOUR_MS, weightG = 4210.5) =>
  decodeSaved((await sendJson(household, "POST", "/api/growth", weighedAt(measuredAt, weightG))).body).measurement

const caregiverId = (household: Household, email: string) =>
  inStorage(household, (sql) => sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("POST /api/growth", () => {
  it("logs a measurement and answers 201, no-store, with it and the keys it changed", async () => {
    const household = await seededHousehold()
    const measurement = { ...weighedAt(NOW - HOUR_MS), lengthCm: 54.2 }
    const response = await send(household, "POST", "/api/growth", JSON.stringify(measurement))
    const andrew = await caregiverId(household, ANDREW.email)
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      measurement: {
        id: expect.any(String),
        measuredAt: NOW - HOUR_MS,
        weightG: 4210.5,
        lengthCm: 54.2,
        headCm: null,
        version: 1,
        createdBy: andrew,
        createdAt: NOW,
        updatedBy: andrew,
        updatedAt: NOW,
        deletedAt: null,
      },
      changed: CHANGED_GROWTH,
    })
  })

  it("answers a retry of a save whose answer was lost with the stored 201, and keeps one measurement (AC 14)", async () => {
    const household = await seededHousehold()
    const measurement = weighedAt(NOW - HOUR_MS)
    const first = await sendJson(household, "POST", "/api/growth", measurement)
    vi.setSystemTime(NOW + 30_000)
    expect(await sendJson(household, "POST", "/api/growth", measurement)).toEqual(first)
    expect(await inStorage(household, (sql) => sql.exec("SELECT id FROM growth_measurements").toArray().length)).toBe(1)
  })

  it("answers a retry with edited values with 409 ACTION_REPLAY_MISMATCH and the saved measurement, and saves nothing new", async () => {
    const household = await seededHousehold()
    const measurement = weighedAt(NOW - HOUR_MS)
    const first = decodeSaved((await sendJson(household, "POST", "/api/growth", measurement)).body)
    expect(await sendJson(household, "POST", "/api/growth", { ...measurement, weightG: 4250 })).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first.measurement },
    })
    const weights = await inStorage(household, (sql) => sql.exec("SELECT weight_g FROM growth_measurements").toArray())
    expect(weights).toEqual([{ weight_g: 4210.5 }])
  })

  it("answers 400 naming all three metrics for a measurement with none", async () => {
    const empty = { ...weighedAt(NOW), weightG: null }
    expect(await sendJson(await seededHousehold(), "POST", "/api/growth", empty)).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "weightG", issue: "invalid" },
          { path: "lengthCm", issue: "invalid" },
          { path: "headCm", issue: "invalid" },
        ],
      },
    })
  })

  it("answers 400 in_future for a time more than 5 minutes ahead of the household's clock (AC 21)", async () => {
    const response = await sendJson(await seededHousehold(), "POST", "/api/growth", weighedAt(NOW + 6 * 60_000))
    expect(response).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "measuredAt", issue: "in_future" }] },
    })
  })

  it("refuses a stranger with 401 before looking at their input, which is malformed", async () => {
    const response = await send(await seededHousehold(), "POST", "/api/growth", "{not json", "stranger@example.test")
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })
})

describe("GET /api/growth", () => {
  it("answers 200, no-store, with every live measurement, newest first", async () => {
    const household = await seededHousehold()
    const older = await logged(household, NOW - 2 * HOUR_MS, 4150)
    const newer = await logged(household, NOW - HOUR_MS, 4210.5)
    const response = await get(household, "/api/growth", EMILY.email)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ measurements: [newer, older] })
  })

  it("refuses a stranger with 401", async () => {
    const response = await get(await seededHousehold(), "/api/growth", "stranger@example.test")
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })
})

describe("PATCH, DELETE and POST …/restore", () => {
  it("edit, delete and restore a measurement, each answering with it and the keys it changed", async () => {
    const household = await seededHousehold()
    const measurement = await logged(household)
    const path = `/api/growth/${measurement.id}`
    const edit = {
      actionId: crypto.randomUUID(),
      version: 1,
      measuredAt: NOW - 2 * HOUR_MS,
      weightG: 4210.5,
      lengthCm: 54.2,
      headCm: null,
    }
    const edited = { ...measurement, measuredAt: NOW - 2 * HOUR_MS, lengthCm: 54.2, version: 2 }
    expect(await sendJson(household, "PATCH", path, edit, EMILY.email)).toEqual({
      status: 200,
      body: {
        measurement: { ...edited, updatedBy: await caregiverId(household, EMILY.email) },
        changed: CHANGED_GROWTH,
      },
    })
    const deleted = { ...edited, version: 3, updatedBy: measurement.createdBy, deletedAt: NOW }
    expect(await sendJson(household, "DELETE", path, { actionId: crypto.randomUUID(), version: 2 })).toEqual({
      status: 200,
      body: { measurement: deleted, changed: [...CHANGED_GROWTH, ["deleted"]] },
    })
    expect(await sendJson(household, "POST", `${path}/restore`, { actionId: crypto.randomUUID(), version: 3 })).toEqual(
      {
        status: 200,
        body: { measurement: { ...deleted, version: 4, deletedAt: null }, changed: [...CHANGED_GROWTH, ["deleted"]] },
      },
    )
  })

  it("let only one of two parents' simultaneous edits through, and answer the other 409 STALE_VERSION (AC 13)", async () => {
    const household = await seededHousehold()
    const measurement = await logged(household)
    const path = `/api/growth/${measurement.id}`
    const edit = (weightG: number) => ({
      actionId: crypto.randomUUID(),
      version: 1,
      measuredAt: measurement.measuredAt,
      ...NO_METRICS,
      weightG,
    })
    const [andrews, emilys] = await Promise.all([
      sendJson(household, "PATCH", path, edit(4250), ANDREW.email),
      sendJson(household, "PATCH", path, edit(4300), EMILY.email),
    ])
    expect([andrews.status, emilys.status].toSorted()).toEqual([200, 409])
    const [saved, refused] = andrews.status === 200 ? [andrews, emilys] : [emilys, andrews]
    expect(refused.body).toEqual({
      _tag: "Conflict",
      code: "STALE_VERSION",
      current: decodeSaved(saved.body).measurement,
    })
  })

  it("answer 400 naming all three metrics to an edit that would clear the last one, and keep the measurement as it was", async () => {
    const household = await seededHousehold()
    const measurement = await logged(household)
    const clearing = { ...weighedAt(measurement.measuredAt), weightG: null, version: 1 }
    expect(await sendJson(household, "PATCH", `/api/growth/${measurement.id}`, clearing)).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "weightG", issue: "invalid" },
          { path: "lengthCm", issue: "invalid" },
          { path: "headCm", issue: "invalid" },
        ],
      },
    })
    expect(await (await get(household, "/api/growth", ANDREW.email)).json()).toEqual({ measurements: [measurement] })
  })

  it("answer 404 for an id no measurement has, in a household that has measurements", async () => {
    const household = await seededHousehold()
    const measurement = await logged(household)
    const edit = { ...weighedAt(measurement.measuredAt), version: 1 }
    expect(await sendJson(household, "PATCH", "/api/growth/no-such-measurement", edit)).toEqual({
      status: 404,
      body: { _tag: "NotFound" },
    })
  })

  it("refuse an actionId already used for another request with 400, and change nothing", async () => {
    const household = await seededHousehold()
    const logging = weighedAt(NOW - HOUR_MS)
    const { measurement } = decodeSaved((await sendJson(household, "POST", "/api/growth", logging)).body)
    const reused = { actionId: logging.actionId, version: 1 }
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(await sendJson(household, "DELETE", `/api/growth/${measurement.id}`, reused)).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "actionId", issue: "invalid" }] },
    })
    const deletedAt = await inStorage(household, (sql) =>
      sql.exec("SELECT deleted_at FROM growth_measurements").toArray(),
    )
    expect(deletedAt).toEqual([{ deleted_at: null }])
  })
})

describe("the receipts the endpoints keep", () => {
  it("hold each request's route and the hash of its canonical body, which a retry sent before a deploy must still match", async () => {
    const household = await seededHousehold()
    const logging = crypto.randomUUID()
    const editing = crypto.randomUUID()
    const deleting = crypto.randomUUID()
    const restoring = crypto.randomUUID()
    const at = NOW - HOUR_MS
    const posted = { headCm: null, lengthCm: null, weightG: 4210.5, measuredAt: at, actionId: logging }
    const { measurement } = decodeSaved((await sendJson(household, "POST", "/api/growth", posted)).body)
    const path = `/api/growth/${measurement.id}`
    const patched = { headCm: null, lengthCm: 54.2, weightG: 4210.5, measuredAt: at, version: 1, actionId: editing }
    await sendJson(household, "PATCH", path, patched)
    await sendJson(household, "DELETE", path, { version: 2, actionId: deleting })
    await sendJson(household, "POST", `${path}/restore`, { version: 3, actionId: restoring })
    const receipts = await inStorage(household, (sql) =>
      sql.exec("SELECT action_id, route, request_hash FROM receipts ORDER BY rowid").toArray(),
    )
    expect(receipts).toEqual([
      {
        action_id: logging,
        route: "POST /api/growth",
        request_hash: await sha256(
          `POST /api/growth\n{"actionId":"${logging}","measuredAt":${at},"weightG":4210.5,"lengthCm":null,"headCm":null}`,
        ),
      },
      {
        action_id: editing,
        route: `PATCH ${path}`,
        request_hash: await sha256(
          `PATCH ${path}\n{"actionId":"${editing}","version":1,"measuredAt":${at},"weightG":4210.5,"lengthCm":54.2,"headCm":null}`,
        ),
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

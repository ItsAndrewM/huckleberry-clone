import { SavedDiaper } from "@bt/contracts"
import { runInDurableObject } from "cloudflare:test"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { HouseholdDO } from "../src/household.ts"
import { ANDREW, EMILY, seededHousehold } from "./fixtures.ts"

const NOW = Date.UTC(2026, 9, 8, 19)
const HOUR_MS = 3_600_000
const CHANGED_TODAY = [["today"], ["last24h"], ["day", "2026-10-08"], ["week", "2026-W41"], ["month", "2026-10"]]

type Household = DurableObjectStub<HouseholdDO>

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedDiaper))

const send = (household: Household, method: string, path: string, body: string, email = ANDREW.email) =>
  household.fetch(`https://bt.example.test${path}`, {
    method,
    headers: { "content-type": "application/json", "x-bt-email": email },
    body,
  })

const sendJson = async (
  household: Household,
  method: string,
  path: string,
  body: Schema.Json,
  email = ANDREW.email,
) => {
  const response = await send(household, method, path, JSON.stringify(body), email)
  return { status: response.status, body: await response.json() }
}

const wetAt = (occurredAt: number) => ({ actionId: crypto.randomUUID(), occurredAt, wet: true, dirty: false })

const logged = async (household: Household) =>
  decodeSaved((await sendJson(household, "POST", "/api/diapers", wetAt(NOW - HOUR_MS))).body).diaper

const inStorage = <R>(household: Household, read: (sql: SqlStorage) => R) =>
  runInDurableObject(household, (_instance, state) => read(state.storage.sql))

const caregiverId = (household: Household, email: string) =>
  inStorage(household, (sql) => sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/diapers", () => {
  it("logs a diaper and answers 201, no-store, with the diaper and the keys it changed", async () => {
    const household = await seededHousehold()
    const response = await send(household, "POST", "/api/diapers", JSON.stringify(wetAt(NOW - HOUR_MS)))
    const andrew = await caregiverId(household, ANDREW.email)
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      diaper: {
        id: expect.any(String),
        occurredAt: NOW - HOUR_MS,
        wet: true,
        dirty: false,
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

  it("answers a retry of a save whose answer was lost with the stored 201, and keeps one diaper (AC 14)", async () => {
    const household = await seededHousehold()
    const diaper = wetAt(NOW - HOUR_MS)
    const first = await sendJson(household, "POST", "/api/diapers", diaper)
    vi.setSystemTime(NOW + 30_000)
    expect(await sendJson(household, "POST", "/api/diapers", diaper)).toEqual(first)
    expect(await inStorage(household, (sql) => sql.exec("SELECT id FROM diapers").toArray().length)).toBe(1)
  })

  it("answers a retry with edited values with 409 ACTION_REPLAY_MISMATCH and the saved diaper, and saves nothing new", async () => {
    const household = await seededHousehold()
    const diaper = wetAt(NOW - HOUR_MS)
    const first = decodeSaved((await sendJson(household, "POST", "/api/diapers", diaper)).body)
    expect(await sendJson(household, "POST", "/api/diapers", { ...diaper, dirty: true })).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first.diaper },
    })
    expect(await inStorage(household, (sql) => sql.exec("SELECT dirty FROM diapers").toArray())).toEqual([{ dirty: 0 }])
  })

  it("answers 400 naming wet and dirty for a diaper that's neither", async () => {
    const response = await sendJson(await seededHousehold(), "POST", "/api/diapers", { ...wetAt(NOW), wet: false })
    expect(response).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "wet", issue: "invalid" },
          { path: "dirty", issue: "invalid" },
        ],
      },
    })
  })

  it("answers 400 in_future for a time more than 5 minutes ahead of the household's clock (AC 21)", async () => {
    const response = await sendJson(await seededHousehold(), "POST", "/api/diapers", wetAt(NOW + 6 * 60_000))
    expect(response).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "occurredAt", issue: "in_future" }] },
    })
  })

  it("refuses a stranger with 401 before looking at their input, which is malformed", async () => {
    const response = await send(await seededHousehold(), "POST", "/api/diapers", "{not json", "stranger@example.test")
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })
})

describe("PATCH, DELETE and POST …/restore", () => {
  it("edit, delete and restore a diaper, each answering with it and the keys it changed", async () => {
    const household = await seededHousehold()
    const diaper = await logged(household)
    const path = `/api/diapers/${diaper.id}`
    const edit = { actionId: crypto.randomUUID(), version: 1, occurredAt: NOW - 2 * HOUR_MS, wet: true, dirty: true }
    const edited = { ...diaper, occurredAt: NOW - 2 * HOUR_MS, dirty: true, version: 2 }
    expect(await sendJson(household, "PATCH", path, edit, EMILY.email)).toEqual({
      status: 200,
      body: { diaper: { ...edited, updatedBy: await caregiverId(household, EMILY.email) }, changed: CHANGED_TODAY },
    })
    const deleted = { ...edited, version: 3, updatedBy: diaper.createdBy, deletedAt: NOW }
    expect(await sendJson(household, "DELETE", path, { actionId: crypto.randomUUID(), version: 2 })).toEqual({
      status: 200,
      body: { diaper: deleted, changed: [...CHANGED_TODAY, ["deleted"]] },
    })
    expect(await sendJson(household, "POST", `${path}/restore`, { actionId: crypto.randomUUID(), version: 3 })).toEqual(
      {
        status: 200,
        body: { diaper: { ...deleted, version: 4, deletedAt: null }, changed: [...CHANGED_TODAY, ["deleted"]] },
      },
    )
  })

  it("let only one of two parents' simultaneous edits through, and answer the other 409 STALE_VERSION (AC 13)", async () => {
    const household = await seededHousehold()
    const diaper = await logged(household)
    const path = `/api/diapers/${diaper.id}`
    const edit = (dirty: boolean) => ({
      actionId: crypto.randomUUID(),
      version: 1,
      occurredAt: diaper.occurredAt,
      wet: true,
      dirty,
    })
    const [andrews, emilys] = await Promise.all([
      sendJson(household, "PATCH", path, edit(true), ANDREW.email),
      sendJson(household, "PATCH", path, edit(false), EMILY.email),
    ])
    expect([andrews.status, emilys.status].toSorted()).toEqual([200, 409])
    const [saved, refused] = andrews.status === 200 ? [andrews, emilys] : [emilys, andrews]
    expect(refused.body).toEqual({ _tag: "Conflict", code: "STALE_VERSION", current: decodeSaved(saved.body).diaper })
  })

  it("answer 404 for an id no diaper has, in a household that has diapers", async () => {
    const household = await seededHousehold()
    const diaper = await logged(household)
    const edit = { actionId: crypto.randomUUID(), version: 1, occurredAt: diaper.occurredAt, wet: true, dirty: true }
    expect(await sendJson(household, "PATCH", "/api/diapers/no-such-diaper", edit)).toEqual({
      status: 404,
      body: { _tag: "NotFound" },
    })
  })

  it("refuse an actionId already used for another request with 400, and change nothing", async () => {
    const household = await seededHousehold()
    const logging = wetAt(NOW - HOUR_MS)
    const { diaper } = decodeSaved((await sendJson(household, "POST", "/api/diapers", logging)).body)
    const reused = { actionId: logging.actionId, version: 1 }
    expect(await sendJson(household, "DELETE", `/api/diapers/${diaper.id}`, reused)).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "actionId", issue: "invalid" }] },
    })
    expect(await inStorage(household, (sql) => sql.exec("SELECT deleted_at FROM diapers").toArray())).toEqual([
      { deleted_at: null },
    ])
  })
})

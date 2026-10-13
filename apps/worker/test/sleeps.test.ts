import { SavedSleep } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, CHANGED_TODAY, EMILY, HOUR_MS, MINUTE_MS, NOW, seededHousehold } from "./fixtures.ts"
import { type Household, inStorage, send, sendJson } from "./requests.ts"

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedSleep))

const startAt = (startedAt: number) => ({ actionId: crypto.randomUUID(), kind: "nap", startedAt })

const pastSleep = (startedAt: number, endedAt: number) => ({
  actionId: crypto.randomUUID(),
  kind: "night",
  startedAt,
  endedAt,
})

const started = async (household: Household, startedAt = NOW - 30 * MINUTE_MS) =>
  decodeSaved((await sendJson(household, "POST", "/api/sleeps/start", startAt(startedAt))).body).sleep

const caregiverId = (household: Household, email: string) =>
  inStorage(household, (sql) => sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id)

const sleepRows = (household: Household) => inStorage(household, (sql) => sql.exec("SELECT id FROM sleeps").toArray())

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("POST /api/sleeps/start", () => {
  it("starts a sleep and answers 201, no-store, with the running sleep and the keys it changed", async () => {
    const household = await seededHousehold()
    const response = await send(household, "POST", "/api/sleeps/start", JSON.stringify(startAt(NOW - MINUTE_MS)))
    const andrew = await caregiverId(household, ANDREW.email)
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      sleep: {
        id: expect.any(String),
        kind: "nap",
        startedAt: NOW - MINUTE_MS,
        endedAt: null,
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

  it("answers 409 SLEEP_ALREADY_ACTIVE with the running sleep when one is already running", async () => {
    const household = await seededHousehold()
    const running = await started(household)
    expect(await sendJson(household, "POST", "/api/sleeps/start", startAt(NOW), EMILY.email)).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "SLEEP_ALREADY_ACTIVE", current: running },
    })
  })

  it("answers 400 naming kind for a kind other than nap or night", async () => {
    const response = await sendJson(await seededHousehold(), "POST", "/api/sleeps/start", {
      ...startAt(NOW),
      kind: "evening",
    })
    expect(response).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "kind", issue: "invalid" }] },
    })
  })

  it("refuses a stranger with 401 before looking at their input, which is malformed", async () => {
    const response = await send(
      await seededHousehold(),
      "POST",
      "/api/sleeps/start",
      "{not json",
      "stranger@example.test",
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })
})

describe("POST /api/sleeps", () => {
  it("logs a past sleep and answers 201 with it", async () => {
    const response = await sendJson(
      await seededHousehold(),
      "POST",
      "/api/sleeps",
      pastSleep(NOW - 2 * HOUR_MS, NOW - HOUR_MS),
    )
    expect(response).toMatchObject({
      status: 201,
      body: { sleep: { kind: "night", startedAt: NOW - 2 * HOUR_MS, endedAt: NOW - HOUR_MS }, changed: CHANGED_TODAY },
    })
  })

  it("answers a retry of a save whose answer was lost with the stored 201, and keeps one sleep (AC 14)", async () => {
    const household = await seededHousehold()
    const sleep = pastSleep(NOW - 2 * HOUR_MS, NOW - HOUR_MS)
    const first = await sendJson(household, "POST", "/api/sleeps", sleep)
    vi.setSystemTime(NOW + 30_000)
    expect(await sendJson(household, "POST", "/api/sleeps", sleep)).toEqual(first)
    expect(await sleepRows(household)).toHaveLength(1)
  })

  it("answers a retry with edited values with 409 ACTION_REPLAY_MISMATCH and the saved sleep, and saves nothing new", async () => {
    const household = await seededHousehold()
    const sleep = pastSleep(NOW - 2 * HOUR_MS, NOW - HOUR_MS)
    const first = decodeSaved((await sendJson(household, "POST", "/api/sleeps", sleep)).body)
    expect(await sendJson(household, "POST", "/api/sleeps", { ...sleep, kind: "nap" })).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first.sleep },
    })
    expect(await sleepRows(household)).toHaveLength(1)
  })

  it("answers 409 SLEEP_OVERLAP with the sleep it runs into", async () => {
    const household = await seededHousehold()
    const earlier = decodeSaved(
      (await sendJson(household, "POST", "/api/sleeps", pastSleep(NOW - 3 * HOUR_MS, NOW - HOUR_MS))).body,
    ).sleep
    expect(await sendJson(household, "POST", "/api/sleeps", pastSleep(NOW - 2 * HOUR_MS, NOW - MINUTE_MS))).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "SLEEP_OVERLAP", current: earlier },
    })
  })

  it("answers 400 naming endedAt for a past sleep with no end", async () => {
    const response = await sendJson(await seededHousehold(), "POST", "/api/sleeps", {
      ...pastSleep(NOW - HOUR_MS, NOW),
      endedAt: null,
    })
    expect(response).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "endedAt", issue: "invalid" }] },
    })
  })

  it("answers 400 in_future for an end more than 5 minutes ahead of the household's clock (AC 21)", async () => {
    const response = await sendJson(
      await seededHousehold(),
      "POST",
      "/api/sleeps",
      pastSleep(NOW - HOUR_MS, NOW + 6 * MINUTE_MS),
    )
    expect(response).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "endedAt", issue: "in_future" }] },
    })
  })
})

describe("POST …/wake, PATCH, DELETE and POST …/restore", () => {
  it("wake, edit, delete and restore a sleep, each answering with it and the keys it changed", async () => {
    const household = await seededHousehold()
    const sleep = await started(household)
    const path = `/api/sleeps/${sleep.id}`
    const emily = await caregiverId(household, EMILY.email)
    const woken = { ...sleep, endedAt: NOW - MINUTE_MS, version: 2, updatedBy: emily }
    const wake = { actionId: crypto.randomUUID(), version: 1, occurredAt: NOW - MINUTE_MS }
    expect(await sendJson(household, "POST", `${path}/wake`, wake, EMILY.email)).toEqual({
      status: 200,
      body: { sleep: woken, changed: CHANGED_TODAY },
    })
    const edit = {
      actionId: crypto.randomUUID(),
      version: 2,
      kind: "night",
      startedAt: NOW - HOUR_MS,
      endedAt: NOW - MINUTE_MS,
    }
    const edited = { ...woken, kind: "night", startedAt: NOW - HOUR_MS, version: 3, updatedBy: sleep.createdBy }
    expect(await sendJson(household, "PATCH", path, edit)).toEqual({
      status: 200,
      body: { sleep: edited, changed: CHANGED_TODAY },
    })
    const deleted = { ...edited, version: 4, deletedAt: NOW }
    expect(await sendJson(household, "DELETE", path, { actionId: crypto.randomUUID(), version: 3 })).toEqual({
      status: 200,
      body: { sleep: deleted, changed: [...CHANGED_TODAY, ["deleted"]] },
    })
    expect(await sendJson(household, "POST", `${path}/restore`, { actionId: crypto.randomUUID(), version: 4 })).toEqual(
      {
        status: 200,
        body: { sleep: { ...deleted, version: 5, deletedAt: null }, changed: [...CHANGED_TODAY, ["deleted"]] },
      },
    )
  })

  it("answers 409 STALE_VERSION with the sleep as it is now for a wake from an old version", async () => {
    const household = await seededHousehold()
    const sleep = await started(household)
    const wake = (occurredAt: number) => ({ actionId: crypto.randomUUID(), version: 1, occurredAt })
    const first = decodeSaved((await sendJson(household, "POST", `/api/sleeps/${sleep.id}/wake`, wake(NOW))).body)
    expect(await sendJson(household, "POST", `/api/sleeps/${sleep.id}/wake`, wake(NOW), EMILY.email)).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "STALE_VERSION", current: first.sleep },
    })
  })

  it("answers 404 for a sleep the household doesn't hold", async () => {
    const response = await sendJson(await seededHousehold(), "DELETE", "/api/sleeps/no-such-sleep", {
      actionId: crypto.randomUUID(),
      version: 1,
    })
    expect(response).toEqual({ status: 404, body: { _tag: "NotFound" } })
  })
})

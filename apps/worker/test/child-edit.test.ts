import { SavedChild, SavedDiaper, SavedSleep } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { bottle, newFeed } from "./feed-fixtures.ts"
import { ANDREW, EMILY, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, inStorage, send, sendJson, sha256 } from "./requests.ts"

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedChild))
const decodeSavedDiaper = Schema.decodeUnknownSync(Schema.toCodecJson(SavedDiaper))
const decodeSavedSleep = Schema.decodeUnknownSync(Schema.toCodecJson(SavedSleep))

const PROFILE_CHANGED = [["me"], ["today"], ["last24h"]]
const SEP_1_AT_02_30 = Date.UTC(2026, 8, 1, 9, 30)
const SEP_3_BEGINS = Date.UTC(2026, 8, 3, 7)
const OCT_8_AT_22 = Date.UTC(2026, 9, 9, 5)

const editOf = (version: number, birthDate = "2026-09-01") => ({
  actionId: crypto.randomUUID(),
  version,
  name: "Robin Rae",
  birthDate,
  sex: "female",
  gestationalAgeDays: 274,
})

const refusedBirthDate = (issue: string) => ({
  status: 400,
  body: { _tag: "InvalidInput", fieldErrors: [{ path: "birthDate", issue }] },
})

const logDiaper = async (household: Household, occurredAt: number) =>
  decodeSavedDiaper(
    (
      await sendJson(household, "POST", "/api/diapers", {
        actionId: crypto.randomUUID(),
        occurredAt,
        wet: true,
        dirty: false,
      })
    ).body,
  ).diaper

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

describe("PATCH /api/child", () => {
  it("saves the name, birth date, sex and gestational age, and answers 200 no-store with the child and the keys it changed", async () => {
    const household = await seededHousehold()
    const edit = { ...editOf(1, "2026-08-30"), sex: "male" }
    const response = await send(household, "PATCH", "/api/child", JSON.stringify(edit), EMILY.email)
    const saved = {
      name: "Robin Rae",
      birthDate: "2026-08-30",
      sex: "male",
      gestationalAgeDays: 274,
      version: 2,
      updatedBy: await caregiverId(household, EMILY.email),
      updatedAt: NOW,
    }
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ child: saved, changed: PROFILE_CHANGED })
    expect(await (await get(household, "/api/me", ANDREW.email)).json()).toMatchObject({ child: saved })
  })

  it("answers an edit made from an older version 409 STALE_VERSION with the child as it is now, before checking its birth date (AC 13)", async () => {
    const household = await seededHousehold()
    const first = decodeSaved((await sendJson(household, "PATCH", "/api/child", editOf(1), EMILY.email)).body)
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-10-09"))).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "STALE_VERSION", current: first.child },
    })
  })

  it("takes today in the household's zone as a birth date, but not tomorrow, though it's already tomorrow in UTC", async () => {
    vi.setSystemTime(OCT_8_AT_22)
    const household = await seededHousehold()
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-10-09"))).toEqual(
      refusedBirthDate("in_future"),
    )
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-10-08"))).toMatchObject({ status: 200 })
  })

  it("refuses a birth date after the day of a diaper still logged, but not after one deleted", async () => {
    const household = await seededHousehold()
    const diaper = await logDiaper(household, SEP_3_BEGINS)
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-09-04"))).toEqual(
      refusedBirthDate("before_birth"),
    )
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-09-03"))).toMatchObject({ status: 200 })
    await sendJson(household, "DELETE", `/api/diapers/${diaper.id}`, { actionId: crypto.randomUUID(), version: 1 })
    expect(await sendJson(household, "PATCH", "/api/child", editOf(2, "2026-09-04"))).toMatchObject({ status: 200 })
  })

  it("refuses a birth date after the day of a feed's earliest part", async () => {
    const household = await seededHousehold()
    await sendJson(household, "POST", "/api/feeds", {
      ...newFeed([], [bottle(SEP_3_BEGINS)]),
      actionId: crypto.randomUUID(),
    })
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-09-04"))).toEqual(
      refusedBirthDate("before_birth"),
    )
  })

  it("refuses a birth date after the day of a sleep's start, but not after a deleted sleep's", async () => {
    const household = await seededHousehold()
    const nap = {
      actionId: crypto.randomUUID(),
      kind: "nap",
      startedAt: SEP_3_BEGINS,
      endedAt: SEP_3_BEGINS + 3_600_000,
    }
    const { body } = await sendJson(household, "POST", "/api/sleeps", nap)
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-09-04"))).toEqual(
      refusedBirthDate("before_birth"),
    )
    const sleep = decodeSavedSleep(body).sleep
    await sendJson(household, "DELETE", `/api/sleeps/${sleep.id}`, { actionId: crypto.randomUUID(), version: 1 })
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1, "2026-09-04"))).toMatchObject({ status: 200 })
  })

  it("takes a name-only edit when a move west has put an early entry before the unchanged birth date", async () => {
    const household = await seededHousehold()
    await logDiaper(household, SEP_1_AT_02_30)
    await sendJson(household, "PATCH", "/api/household", {
      actionId: crypto.randomUUID(),
      version: 1,
      timeZone: "Pacific/Honolulu",
      units: { volume: "ml", weight: "kg", length: "cm" },
    })
    expect(await sendJson(household, "PATCH", "/api/child", editOf(1))).toMatchObject({
      status: 200,
      body: { child: { name: "Robin Rae", birthDate: "2026-09-01" } },
    })
  })

  it("answers 400 naming each field it can't take", async () => {
    const edit = { ...editOf(1), name: " Robin", sex: "unknown", gestationalAgeDays: 400 }
    expect(await sendJson(await seededHousehold(), "PATCH", "/api/child", edit)).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "name", issue: "invalid" },
          { path: "sex", issue: "invalid" },
          { path: "gestationalAgeDays", issue: "invalid" },
        ],
      },
    })
  })

  it("refuses a stranger with 401 before looking at their input, which is malformed", async () => {
    const response = await send(await seededHousehold(), "PATCH", "/api/child", "{not json", "stranger@example.test")
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })

  it("holds its route and the hash of its canonical body, which a retry sent before a deploy must still match", async () => {
    const household = await seededHousehold()
    const actionId = crypto.randomUUID()
    await sendJson(household, "PATCH", "/api/child", {
      gestationalAgeDays: 274,
      sex: "female",
      birthDate: "2026-09-01",
      name: "Robin Rae",
      version: 1,
      actionId,
    })
    const canonical = `{"actionId":"${actionId}","version":1,"name":"Robin Rae","birthDate":"2026-09-01","sex":"female","gestationalAgeDays":274}`
    expect(await inStorage(household, (sql) => sql.exec("SELECT route, request_hash FROM receipts").one())).toEqual({
      route: "PATCH /api/child",
      request_hash: await sha256(`PATCH /api/child\n${canonical}`),
    })
  })
})

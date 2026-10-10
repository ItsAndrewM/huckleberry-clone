import { SavedHousehold, Today } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, EMILY, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, inStorage, send, sendJson, sha256 } from "./requests.ts"

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedHousehold))
const decodeToday = Schema.decodeUnknownSync(Schema.toCodecJson(Today))

const PROFILE_CHANGED = [["me"], ["today"], ["last24h"]]
const METRIC = { volume: "ml", weight: "kg", length: "cm" }
const IMPERIAL = { volume: "fl_oz", weight: "lb_oz", length: "in" }

const editOf = (version: number, timeZone: string, units = IMPERIAL) => ({
  actionId: crypto.randomUUID(),
  version,
  timeZone,
  units,
})

const caregiverId = (household: Household, email: string) =>
  inStorage(household, (sql) => sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id)

const todaysDate = async (household: Household) =>
  decodeToday(await (await get(household, "/api/today", ANDREW.email)).json()).date

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("PATCH /api/household", () => {
  it("saves the time zone and units, and answers 200 no-store with the household and the keys it changed", async () => {
    const household = await seededHousehold()
    const response = await send(
      household,
      "PATCH",
      "/api/household",
      JSON.stringify(editOf(1, "America/Toronto")),
      EMILY.email,
    )
    const saved = {
      name: "Test household",
      timeZone: "America/Toronto",
      units: IMPERIAL,
      version: 2,
      updatedBy: await caregiverId(household, EMILY.email),
      updatedAt: NOW,
    }
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ household: saved, changed: PROFILE_CHANGED })
    expect(await (await get(household, "/api/me", ANDREW.email)).json()).toMatchObject({ household: saved })
  })

  it("keeps the zone by its canonical name, whichever alias the phone sent", async () => {
    const response = await sendJson(await seededHousehold(), "PATCH", "/api/household", editOf(1, "US/Eastern"))
    expect(response).toMatchObject({ status: 200, body: { household: { timeZone: "America/New_York" } } })
  })

  it("moves Today to the new zone's date at once", async () => {
    const household = await seededHousehold()
    expect(await todaysDate(household)).toBe("2026-10-08")
    await sendJson(household, "PATCH", "/api/household", editOf(1, "Asia/Tokyo"))
    expect(await todaysDate(household)).toBe("2026-10-09")
  })

  it("answers a retry whose answer was lost with the stored answer, and edits the household once (AC 14)", async () => {
    const household = await seededHousehold()
    const edit = editOf(1, "America/Toronto")
    const first = await sendJson(household, "PATCH", "/api/household", edit)
    vi.setSystemTime(NOW + 30_000)
    expect(await sendJson(household, "PATCH", "/api/household", edit)).toEqual(first)
    expect(await inStorage(household, (sql) => sql.exec("SELECT version FROM household").one())).toEqual({ version: 2 })
  })

  it("answers a retry with other values with 409 ACTION_REPLAY_MISMATCH and the saved household, and changes nothing", async () => {
    const household = await seededHousehold()
    const edit = editOf(1, "America/Toronto")
    const first = decodeSaved((await sendJson(household, "PATCH", "/api/household", edit)).body)
    expect(await sendJson(household, "PATCH", "/api/household", { ...edit, units: METRIC })).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first.household },
    })
    expect(await inStorage(household, (sql) => sql.exec("SELECT volume_unit, version FROM household").one())).toEqual({
      volume_unit: "fl_oz",
      version: 2,
    })
  })

  it("lets only one of two parents' simultaneous edits through, and answers the other 409 STALE_VERSION (AC 13)", async () => {
    const household = await seededHousehold()
    const [andrews, emilys] = await Promise.all([
      sendJson(household, "PATCH", "/api/household", editOf(1, "America/Toronto"), ANDREW.email),
      sendJson(household, "PATCH", "/api/household", editOf(1, "Europe/London", METRIC), EMILY.email),
    ])
    expect([andrews.status, emilys.status].toSorted()).toEqual([200, 409])
    const [saved, refused] = andrews.status === 200 ? [andrews, emilys] : [emilys, andrews]
    expect(refused.body).toEqual({
      _tag: "Conflict",
      code: "STALE_VERSION",
      current: decodeSaved(saved.body).household,
    })
  })

  it("answers 400 naming each field that isn't a time zone or one of its unit's choices", async () => {
    const edit = { ...editOf(1, "Mars/Olympus_Mons"), units: { ...IMPERIAL, volume: "oz" } }
    expect(await sendJson(await seededHousehold(), "PATCH", "/api/household", edit)).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "timeZone", issue: "invalid" },
          { path: "units.volume", issue: "invalid" },
        ],
      },
    })
  })

  it("refuses a stranger with 401 before looking at their input, which is malformed", async () => {
    const response = await send(
      await seededHousehold(),
      "PATCH",
      "/api/household",
      "{not json",
      "stranger@example.test",
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })

  it("holds its route and the hash of its canonical body, which a retry sent before a deploy must still match", async () => {
    const household = await seededHousehold()
    const actionId = crypto.randomUUID()
    await sendJson(household, "PATCH", "/api/household", {
      units: { length: "in", weight: "lb_oz", volume: "fl_oz" },
      timeZone: "America/Toronto",
      version: 1,
      actionId,
    })
    const canonical = `{"actionId":"${actionId}","version":1,"timeZone":"America/Toronto","units":{"volume":"fl_oz","weight":"lb_oz","length":"in"}}`
    expect(await inStorage(household, (sql) => sql.exec("SELECT route, request_hash FROM receipts").one())).toEqual({
      route: "PATCH /api/household",
      request_hash: await sha256(`PATCH /api/household\n${canonical}`),
    })
  })
})

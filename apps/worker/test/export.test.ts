import { HouseholdExport, SavedDiaper } from "@bt/contracts"
import { runInDurableObject } from "cloudflare:test"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MIGRATIONS } from "../src/db/migrations.ts"
import { ACTION_ID, ANDREW, HOUR_MS, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, inStorage, sendJson } from "./requests.ts"

const decodeExport = Schema.decodeUnknownSync(Schema.toCodecJson(HouseholdExport))

const exported = async (household: Household) => {
  const response = await get(household, "/api/export.json", ANDREW.email)
  return { response, body: decodeExport(await response.json()) }
}

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedDiaper))

const diaperAt = async (household: Household, occurredAt: number) => {
  const payload = { actionId: crypto.randomUUID(), occurredAt, wet: true, dirty: false }
  return decodeSaved((await sendJson(household, "POST", "/api/diapers", payload)).body).diaper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/export.json", () => {
  it("answers 200, no-store, with the format, the time, every migration applied and a table per name", async () => {
    const { response, body } = await exported(await seededHousehold())
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(body.format).toBe("baby-tracker-export")
    expect(body.version).toBe(1)
    expect(body.exportedAt).toBe(NOW)
    expect(body.migrations).toEqual(MIGRATIONS.map(({ name }) => name))
    expect(Object.keys(body.tables)).toEqual([
      "bottle_portions",
      "caregivers",
      "child",
      "diapers",
      "feeds",
      "growth_measurements",
      "household",
      "nursing_segments",
    ])
  })

  it("keeps every column of every row, deleted rows and their audit included", async () => {
    const household = await seededHousehold()
    const { id } = await diaperAt(household, NOW - HOUR_MS)
    await sendJson(household, "DELETE", `/api/diapers/${id}`, { actionId: crypto.randomUUID(), version: 1 })
    const andrew = await inStorage(
      household,
      (sql) => sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", ANDREW.email).one().id,
    )
    const { body } = await exported(household)
    expect(body.tables.diapers).toEqual([
      {
        id,
        occurred_at: NOW - HOUR_MS,
        wet: 1,
        dirty: 0,
        version: 2,
        source: "app",
        source_ref: null,
        created_by: andrew,
        created_at: NOW,
        updated_by: andrew,
        updated_at: NOW,
        deleted_at: NOW,
      },
    ])
    expect(body.tables.caregivers?.map(({ email }) => email)).toEqual(["andrew@example.test", "emily@example.test"])
  })

  it("leaves out the receipts and the migration ledger, which the migrations list stands for", async () => {
    const household = await seededHousehold()
    await diaperAt(household, NOW - HOUR_MS)
    const { body } = await exported(household)
    expect(Object.keys(body.tables)).not.toContain("receipts")
    expect(Object.keys(body.tables)).not.toContain("_migrations")
  })

  it("leaves out Cloudflare's own tables, which the storage API and alarms keep beside the household's", async () => {
    const household = await seededHousehold()
    const reserved = await runInDurableObject(household, async (_instance, state) => {
      await state.storage.put("a key", "a value")
      return state.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '\\_cf\\_%' ESCAPE '\\'",
        )
        .toArray()
        .map(({ name }) => name)
    })
    const { body } = await exported(household)
    expect(reserved).toContain("_cf_KV")
    expect(Object.keys(body.tables).filter((table) => table.startsWith("_cf_"))).toEqual([])
  })

  it("takes in a table a later migration adds, with no change to the export", async () => {
    const household = await seededHousehold()
    await inStorage(household, (sql) => {
      sql.exec("CREATE TABLE sleeps (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL) STRICT")
      sql.exec("INSERT INTO sleeps (id, started_at) VALUES ('s1', ?)", NOW)
    })
    const { body } = await exported(household)
    expect(body.tables.sleeps).toEqual([{ id: "s1", started_at: NOW }])
  })

  it("is refused to someone who isn't a caregiver", async () => {
    const response = await get(await seededHousehold(), "/api/export.json", "stranger@example.test")
    expect(response.status).toBe(401)
  })
})

describe("GET /api/export.csv", () => {
  it("answers 200, no-store, as UTF-8 CSV, header first", async () => {
    const household = await seededHousehold()
    await diaperAt(household, NOW - HOUR_MS)
    const response = await get(household, "/api/export.csv", ANDREW.email)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    const [header, diaper] = (await response.text()).split("\r\n")
    expect(header?.startsWith("Kind,Start,End,")).toBe(true)
    expect(diaper).toBe("Diaper,2026-10-08 11:00,,,,,,yes,,,,,Andrew")
  })

  it("is refused to someone who isn't a caregiver", async () => {
    const response = await get(await seededHousehold(), "/api/export.csv", "stranger@example.test")
    expect(response.status).toBe(401)
  })
})

describe("an action id from a save", () => {
  it("never reaches the export, since receipts aren't exported", async () => {
    const household = await seededHousehold()
    await sendJson(household, "POST", "/api/diapers", {
      actionId: ACTION_ID,
      occurredAt: NOW - HOUR_MS,
      wet: true,
      dirty: false,
    })
    const response = await get(household, "/api/export.json", ANDREW.email)
    expect(await response.text()).not.toContain(ACTION_ID)
  })
})

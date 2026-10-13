import { describe, expect, it } from "vitest"
import { createSleep, loadSleep, saveSleep } from "../src/core/sleeps/store.ts"
import { ANDREW, caregiverId, EMILY, inHousehold, minutesAgo, NOW, stampOf } from "./fixtures.ts"

const BEFORE_INSTANTS = Date.UTC(2000, 0, 1) - 1
const AFTER_INSTANTS = Date.UTC(2100, 0, 1)
const NOW_IN_SECONDS = NOW / 1000

const insertSleep = (
  sql: SqlStorage,
  kind: string,
  startedAt: number,
  endedAt: number | null,
  deletedAt: number | null = null,
) => {
  const andrew = caregiverId(sql, ANDREW.email)
  sql.exec(
    `INSERT INTO sleeps (id, kind, started_at, ended_at, version, created_by, created_at, updated_by, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    kind,
    startedAt,
    endedAt,
    andrew,
    NOW,
    andrew,
    NOW,
    deletedAt,
  )
}

describe("the sleep store", () => {
  it("creates a sleep as version 1, stamped with who logged it", async () => {
    const { sleep, andrew } = await inHousehold((sql) => ({
      sleep: createSleep(sql, stampOf(sql), { kind: "night", startedAt: minutesAgo(90), endedAt: minutesAgo(10) }),
      andrew: caregiverId(sql, ANDREW.email),
    }))
    expect(sleep).toEqual({
      id: expect.any(String),
      kind: "night",
      startedAt: minutesAgo(90),
      endedAt: minutesAgo(10),
      version: 1,
      createdBy: andrew,
      createdAt: NOW,
      updatedBy: andrew,
      updatedAt: NOW,
      deletedAt: null,
    })
  })

  it("saves a sleep as the next version, stamped with who saved it and when, keeping who logged it", async () => {
    const { created, saved, loaded, emily } = await inHousehold((sql) => {
      const created = createSleep(sql, stampOf(sql), { kind: "nap", startedAt: minutesAgo(40), endedAt: null })
      const later = stampOf(sql, EMILY.email, NOW + 60_000)
      const saved = saveSleep(sql, later, { ...created, kind: "night", endedAt: NOW })
      return { created, saved, loaded: loadSleep(sql, created.id), emily: caregiverId(sql, EMILY.email) }
    })
    expect(saved).toEqual({
      ...created,
      kind: "night",
      endedAt: NOW,
      version: 2,
      updatedBy: emily,
      updatedAt: NOW + 60_000,
    })
    expect(loaded).toEqual(saved)
  })

  it("finds no sleep for an id it doesn't hold", async () => {
    expect(await inHousehold((sql) => loadSleep(sql, "no-such-sleep"))).toBeUndefined()
  })
})

describe("the sleeps table", () => {
  it("holds at most one live running sleep, whatever writes it, beside any number of deleted ones", async () => {
    await inHousehold((sql) => {
      insertSleep(sql, "nap", minutesAgo(90), null, minutesAgo(80))
      insertSleep(sql, "nap", minutesAgo(70), null, minutesAgo(60))
      insertSleep(sql, "night", minutesAgo(10), null)
      expect(() => insertSleep(sql, "nap", minutesAgo(5), null)).toThrow("UNIQUE constraint failed")
    })
  })

  it.each([
    ["a kind other than nap or night", "evening", minutesAgo(60), minutesAgo(30), null],
    ["a sleep that ends as it starts", "nap", minutesAgo(60), minutesAgo(60), null],
    ["a sleep that ends before it starts", "nap", minutesAgo(60), minutesAgo(61), null],
    ["a sleep that starts before the years an Instant allows", "nap", BEFORE_INSTANTS, null, null],
    ["a sleep that ends after them", "night", minutesAgo(60), AFTER_INSTANTS, null],
    ["a sleep deleted in seconds, not milliseconds", "nap", minutesAgo(60), minutesAgo(30), NOW_IN_SECONDS],
  ])("refuses %s", async (_label, kind, startedAt, endedAt, deletedAt) => {
    await inHousehold((sql) => {
      expect(() => insertSleep(sql, kind, startedAt, endedAt, deletedAt)).toThrow("CHECK constraint failed")
    })
  })
})

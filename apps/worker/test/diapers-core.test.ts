import type { NewDiaper } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { deleteDiaper, editDiaper, logDiaper, restoreDiaper } from "../src/core/diapers.ts"
import type { Stamp } from "../src/core/receipts.ts"
import {
  ACTION_ID,
  ANDREW,
  BIRTH_DATE_BEGINS,
  CHANGED_TODAY,
  caregiverId,
  EMILY,
  inHousehold,
  MINUTE_MS,
  NOW,
  OCT_1_AT_00_30,
  SEP_30_AT_23_30,
  saved,
  stampOf,
} from "./fixtures.ts"

const wet = (occurredAt = NOW - 60 * MINUTE_MS): NewDiaper => ({
  actionId: ACTION_ID,
  occurredAt,
  wet: true,
  dirty: false,
})

describe("logging a diaper", () => {
  it("saves it as version 1, from the app, stamped with who logged it and when", async () => {
    const { result, andrew, row } = await inHousehold((sql) => ({
      result: logDiaper(stampOf(sql), wet())(sql),
      andrew: caregiverId(sql, ANDREW.email),
      row: sql.exec("SELECT source, source_ref FROM diapers").one(),
    }))
    expect(result).toEqual({
      ok: true,
      response: {
        id: expect.any(String),
        occurredAt: NOW - 60 * MINUTE_MS,
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
    expect(row).toEqual({ source: "app", source_ref: null })
  })

  it("accepts a time up to 5 minutes ahead of the server's clock, for a phone whose clock runs fast", async () => {
    const result = await inHousehold((sql) => logDiaper(stampOf(sql), wet(NOW + 5 * MINUTE_MS))(sql))
    expect(result.ok).toBe(true)
  })

  it.each([
    ["more than 5 minutes ahead of the server's clock", NOW + 5 * MINUTE_MS + 1, "in_future"],
    ["before the birth date began in the household's time zone", BIRTH_DATE_BEGINS - 1, "before_birth"],
  ])("refuses a time %s, and saves nothing", async (_label, occurredAt, issue) => {
    const { result, diapers } = await inHousehold((sql) => ({
      result: logDiaper(stampOf(sql), wet(occurredAt))(sql),
      diapers: sql.exec("SELECT id FROM diapers").toArray().length,
    }))
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "InvalidInput", fieldErrors: [{ path: "occurredAt", issue }] },
    })
    expect(diapers).toBe(0)
  })

  it("accepts the first moment of the birth date in the household's time zone", async () => {
    const result = await inHousehold((sql) => logDiaper(stampOf(sql), wet(BIRTH_DATE_BEGINS))(sql))
    expect(result.ok).toBe(true)
  })
})

describe("editing a diaper", () => {
  it("changes it, bumps its version, and stamps who edited it and when, keeping who logged it", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: NOW - 30 * MINUTE_MS, wet: true, dirty: true }
      const edited = saved(editDiaper(stampOf(sql, EMILY.email, NOW + 1), logged.id, edit)(sql))
      return { before: logged, after: edited, emily: caregiverId(sql, EMILY.email) }
    })
    expect(after).toEqual({
      ...before,
      occurredAt: NOW - 30 * MINUTE_MS,
      dirty: true,
      version: 2,
      updatedBy: emily,
      updatedAt: NOW + 1,
    })
  })

  it("invalidates both days and both months when it moves across midnight at the end of a month", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet(SEP_30_AT_23_30))(sql))
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: OCT_1_AT_00_30, wet: true, dirty: false }
      return editDiaper(stampOf(sql), logged.id, edit)(sql)
    })
    expect(result.ok && result.changed).toEqual([
      ["today"],
      ["last24h"],
      ["day", "2026-09-30"],
      ["day", "2026-10-01"],
      ["week", "2026-W40"],
      ["month", "2026-09"],
      ["month", "2026-10"],
    ])
  })

  it("refuses an edit made from an older version with STALE_VERSION and the diaper as it is now", async () => {
    const { result, current } = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      const emilys = { actionId: ACTION_ID, version: 1, occurredAt: logged.occurredAt, wet: false, dirty: true }
      const current = saved(editDiaper(stampOf(sql, EMILY.email), logged.id, emilys)(sql))
      const andrews = { actionId: ACTION_ID, version: 1, occurredAt: logged.occurredAt, wet: true, dirty: true }
      return { result: editDiaper(stampOf(sql), logged.id, andrews)(sql), current }
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "Conflict", code: "STALE_VERSION", current } })
  })

  it("refuses an edit to a diaper the other parent just deleted with STALE_VERSION, showing it deleted", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      saved(deleteDiaper(stampOf(sql, EMILY.email), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: logged.occurredAt, wet: true, dirty: true }
      return editDiaper(stampOf(sql), logged.id, edit)(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { version: 2, deletedAt: NOW } },
    })
  })

  it("refuses to move it more than 5 minutes into the future", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: NOW + 6 * MINUTE_MS, wet: true, dirty: false }
      return editDiaper(stampOf(sql), logged.id, edit)(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "occurredAt", issue: "in_future" }] } })
  })

  it("answers NotFound for a diaper that was deleted, even from its current version", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      const deleted = saved(deleteDiaper(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      const edit = { actionId: ACTION_ID, version: deleted.version, occurredAt: NOW, wet: true, dirty: false }
      return editDiaper(stampOf(sql), logged.id, edit)(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

describe("deleting and restoring a diaper", () => {
  it("deletes it softly: it keeps the row, marks when, bumps the version, and invalidates the deleted list", async () => {
    const { logged, result, emily } = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      const deleted = deleteDiaper(stampOf(sql, EMILY.email, NOW + 1), logged.id, { actionId: ACTION_ID, version: 1 })
      return { logged, result: deleted(sql), emily: caregiverId(sql, EMILY.email) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...logged, version: 2, updatedBy: emily, updatedAt: NOW + 1, deletedAt: NOW + 1 },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("restores it as it was, with a new version and no deletedAt", async () => {
    const { logged, restored } = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      saved(deleteDiaper(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      return {
        logged,
        restored: saved(restoreDiaper(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 2 })(sql)),
      }
    })
    expect(restored).toEqual({ ...logged, version: 3 })
  })

  it("answers NotFound when restoring a diaper that isn't deleted", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      return restoreDiaper(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it("refuses a delete made from an older version with STALE_VERSION", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), wet())(sql))
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: logged.occurredAt, wet: false, dirty: true }
      saved(editDiaper(stampOf(sql, EMILY.email), logged.id, edit)(sql))
      return deleteDiaper(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { version: 2 } },
    })
  })

  const unknown = "no-such-diaper"
  it.each([
    ["an edit", (stamp: Stamp) => editDiaper(stamp, unknown, { ...wet(NOW), version: 1 })],
    ["a delete", (stamp: Stamp) => deleteDiaper(stamp, unknown, { actionId: ACTION_ID, version: 1 })],
    ["a restore", (stamp: Stamp) => restoreDiaper(stamp, unknown, { actionId: ACTION_ID, version: 1 })],
  ])("answers NotFound to %s of a diaper that never existed", async (_label, core) => {
    const result = await inHousehold((sql) => core(stampOf(sql))(sql))
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

describe("the diapers table", () => {
  const insert = (sql: SqlStorage, wet: number, dirty: number, source: string, sourceRef: string | null) => {
    const andrew = caregiverId(sql, ANDREW.email)
    sql.exec(
      `INSERT INTO diapers (id, occurred_at, wet, dirty, version, source, source_ref, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      NOW,
      wet,
      dirty,
      source,
      sourceRef,
      andrew,
      NOW,
      andrew,
      NOW,
    )
  }

  it("refuses a diaper that's neither wet nor dirty, whatever writes it", async () => {
    await inHousehold((sql) => {
      expect(() => insert(sql, 0, 0, "app", null)).toThrow("CHECK constraint failed")
    })
  })

  it("keeps one row per imported source row, and any number of rows from the app (D4)", async () => {
    await inHousehold((sql) => {
      insert(sql, 1, 0, "app", null)
      insert(sql, 1, 0, "app", null)
      insert(sql, 1, 0, "import", "row-7")
      expect(() => insert(sql, 0, 1, "import", "row-7")).toThrow("UNIQUE constraint failed")
    })
  })

  it.each([
    ["an imported row without its source row", "import", null],
    ["an app row with a source row", "app", "row-7"],
  ])("refuses %s", async (_label, source, sourceRef) => {
    await inHousehold((sql) => {
      expect(() => insert(sql, 1, 0, source, sourceRef)).toThrow("CHECK constraint failed")
    })
  })
})

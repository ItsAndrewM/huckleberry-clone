import type { MeasurementEdit, NewMeasurement } from "@bt/contracts"
import { gramsFromPoundsOunces } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { deletedOf } from "../src/core/deleted.ts"
import { deleteMeasurement, editMeasurement, growthOf, logMeasurement, restoreMeasurement } from "../src/core/growth.ts"
import { editChild } from "../src/core/household-edits.ts"
import type { Stamp } from "../src/core/receipts.ts"
import {
  ACTION_ID,
  ANDREW,
  BIRTH_DATE_BEGINS,
  CHANGED_TODAY,
  caregiverId,
  EMILY,
  HOUR_MS,
  inHousehold,
  MINUTE_MS,
  NOW,
  OCT_1_AT_00_30,
  SEP_30_AT_23_30,
  saved,
  stampOf,
} from "./fixtures.ts"

const CHANGED_GROWTH = [...CHANGED_TODAY, ["growth"]]
const BEFORE_INSTANTS = Date.UTC(2000, 0, 1) - 1
const SEP_3_BEGINS = Date.UTC(2026, 8, 3, 7)
const NO_METRICS = { weightG: null, lengthCm: null, headCm: null }

const weighed = (measuredAt = NOW - HOUR_MS, weightG = 4210.5): NewMeasurement => ({
  actionId: ACTION_ID,
  measuredAt,
  ...NO_METRICS,
  weightG,
})

const editFrom = (version: number, changes: Partial<MeasurementEdit> = {}): MeasurementEdit => ({
  ...weighed(),
  version,
  ...changes,
})

const birthDateEdit = (birthDate: string) => ({
  actionId: ACTION_ID,
  version: 1,
  name: "Robin",
  birthDate,
  sex: "female" as const,
  gestationalAgeDays: 281,
})

describe("logging a measurement", () => {
  it("saves it as version 1, from the app, stamped with who logged it and when", async () => {
    const { result, andrew, row } = await inHousehold((sql) => ({
      result: logMeasurement(stampOf(sql), { ...weighed(), lengthCm: 54.2 })(sql),
      andrew: caregiverId(sql, ANDREW.email),
      row: sql.exec("SELECT source, source_ref FROM growth_measurements").one(),
    }))
    expect(result).toEqual({
      ok: true,
      response: {
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
    expect(row).toEqual({ source: "app", source_ref: null })
  })

  it("accepts a time up to 5 minutes ahead of the server's clock, for a phone whose clock runs fast", async () => {
    const result = await inHousehold((sql) => logMeasurement(stampOf(sql), weighed(NOW + 5 * MINUTE_MS))(sql))
    expect(result.ok).toBe(true)
  })

  it.each([
    ["more than 5 minutes ahead of the server's clock", NOW + 5 * MINUTE_MS + 1, "in_future"],
    ["before the birth date began in the household's time zone", BIRTH_DATE_BEGINS - 1, "before_birth"],
  ])("refuses a time %s, and saves nothing", async (_label, measuredAt, issue) => {
    const { result, measurements } = await inHousehold((sql) => ({
      result: logMeasurement(stampOf(sql), weighed(measuredAt))(sql),
      measurements: sql.exec("SELECT id FROM growth_measurements").toArray().length,
    }))
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "InvalidInput", fieldErrors: [{ path: "measuredAt", issue }] },
    })
    expect(measurements).toBe(0)
  })

  it("accepts the first moment of the birth date in the household's time zone, for a weight taken at birth", async () => {
    const result = await inHousehold((sql) => logMeasurement(stampOf(sql), weighed(BIRTH_DATE_BEGINS, 3400))(sql))
    expect(result.ok).toBe(true)
  })

  it("keeps a weight converted from pounds and ounces unrounded, so it reads back as the same pounds and ounces", async () => {
    const grams = gramsFromPoundsOunces(7, 8.5)
    const list = await inHousehold((sql) => {
      saved(logMeasurement(stampOf(sql), weighed(NOW - HOUR_MS, grams))(sql))
      return growthOf(sql)
    })
    expect(list.measurements.map(({ weightG }) => weightG)).toEqual([grams])
  })
})

describe("editing a measurement", () => {
  it("changes it, bumps its version, and stamps who edited it and when, keeping who logged it", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      const edit = editFrom(1, { measuredAt: NOW - 2 * HOUR_MS, weightG: 4250, headCm: 37.1 })
      const edited = saved(editMeasurement(stampOf(sql, EMILY.email, NOW + 1), logged.id, edit)(sql))
      return { before: logged, after: edited, emily: caregiverId(sql, EMILY.email) }
    })
    expect(after).toEqual({
      ...before,
      measuredAt: NOW - 2 * HOUR_MS,
      weightG: 4250,
      headCm: 37.1,
      version: 2,
      updatedBy: emily,
      updatedAt: NOW + 1,
    })
  })

  it("clears a metric sent as null, and keeps the others", async () => {
    const edited = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), { ...weighed(), lengthCm: 54.2, headCm: 37.1 })(sql))
      return saved(editMeasurement(stampOf(sql), logged.id, editFrom(1, { lengthCm: 54.2, headCm: null }))(sql))
    })
    expect(edited).toMatchObject({ weightG: 4210.5, lengthCm: 54.2, headCm: null, version: 2 })
  })

  it("invalidates both days, both months and growth when it moves across midnight at the end of a month", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed(SEP_30_AT_23_30))(sql))
      return editMeasurement(stampOf(sql), logged.id, editFrom(1, { measuredAt: OCT_1_AT_00_30 }))(sql)
    })
    expect(result.ok && result.changed).toEqual([
      ["today"],
      ["last24h"],
      ["day", "2026-09-30"],
      ["day", "2026-10-01"],
      ["week", "2026-W40"],
      ["month", "2026-09"],
      ["month", "2026-10"],
      ["growth"],
    ])
  })

  it("refuses an edit made from an older version with STALE_VERSION and the measurement as it is now", async () => {
    const { result, current } = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      const current = saved(editMeasurement(stampOf(sql, EMILY.email), logged.id, editFrom(1, { weightG: 4250 }))(sql))
      return { result: editMeasurement(stampOf(sql), logged.id, editFrom(1, { weightG: 4300 }))(sql), current }
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "Conflict", code: "STALE_VERSION", current } })
  })

  it("refuses an edit to a measurement the other parent just deleted with STALE_VERSION, showing it deleted", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      saved(deleteMeasurement(stampOf(sql, EMILY.email), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      return editMeasurement(stampOf(sql), logged.id, editFrom(1, { weightG: 4250 }))(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { version: 2, deletedAt: NOW } },
    })
  })

  it("refuses to move it more than 5 minutes into the future", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      return editMeasurement(stampOf(sql), logged.id, editFrom(1, { measuredAt: NOW + 6 * MINUTE_MS }))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "measuredAt", issue: "in_future" }] } })
  })

  it("answers NotFound for a measurement that was deleted, even from its current version", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      const deleted = saved(deleteMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      return editMeasurement(stampOf(sql), logged.id, editFrom(deleted.version))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

describe("deleting and restoring a measurement", () => {
  it("deletes it softly: it keeps the row, marks when, bumps the version, and invalidates the deleted list", async () => {
    const { logged, result, emily } = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      const action = { actionId: ACTION_ID, version: 1 }
      const deleted = deleteMeasurement(stampOf(sql, EMILY.email, NOW + 1), logged.id, action)
      return { logged, result: deleted(sql), emily: caregiverId(sql, EMILY.email) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...logged, version: 2, updatedBy: emily, updatedAt: NOW + 1, deletedAt: NOW + 1 },
      changed: [...CHANGED_GROWTH, ["deleted"]],
    })
  })

  it("restores it as it was, with a new version and no deletedAt", async () => {
    const { logged, restored } = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      saved(deleteMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      const restoring = restoreMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 2 })
      return { logged, restored: saved(restoring(sql)) }
    })
    expect(restored).toEqual({ ...logged, version: 3 })
  })

  it("refuses to restore a measurement from before the birth date with before_birth, and leaves it deleted", async () => {
    const { result, stillDeleted } = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed(SEP_3_BEGINS))(sql))
      saved(deleteMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      saved(editChild(stampOf(sql), birthDateEdit("2026-09-04"))(sql))
      const result = restoreMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 2 })(sql)
      return {
        result,
        stillDeleted: deletedOf(sql, NOW)
          .measurements.map(({ id }) => id)
          .includes(logged.id),
      }
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "InvalidInput", fieldErrors: [{ path: "measuredAt", issue: "before_birth" }] },
    })
    expect(stillDeleted).toBe(true)
  })

  it("answers NotFound when restoring a measurement that isn't deleted", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      return restoreMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it("refuses a delete made from an older version with STALE_VERSION", async () => {
    const result = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed())(sql))
      saved(editMeasurement(stampOf(sql, EMILY.email), logged.id, editFrom(1, { weightG: 4250 }))(sql))
      return deleteMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { version: 2 } },
    })
  })

  const unknown = "no-such-measurement"
  it.each([
    ["an edit", (stamp: Stamp) => editMeasurement(stamp, unknown, editFrom(1))],
    ["a delete", (stamp: Stamp) => deleteMeasurement(stamp, unknown, { actionId: ACTION_ID, version: 1 })],
    ["a restore", (stamp: Stamp) => restoreMeasurement(stamp, unknown, { actionId: ACTION_ID, version: 1 })],
  ])("answers NotFound to %s of a measurement that never existed", async (_label, core) => {
    const result = await inHousehold((sql) => core(stampOf(sql))(sql))
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

describe("the growth list", () => {
  it("holds every live measurement, newest first, and leaves out deleted ones", async () => {
    const { list, newest, oldest } = await inHousehold((sql) => {
      const oldest = saved(logMeasurement(stampOf(sql), weighed(NOW - 3 * HOUR_MS, 4100))(sql))
      const deleted = saved(logMeasurement(stampOf(sql), weighed(NOW - 2 * HOUR_MS, 4150))(sql))
      const newest = saved(logMeasurement(stampOf(sql), weighed(NOW - HOUR_MS, 4200))(sql))
      saved(deleteMeasurement(stampOf(sql), deleted.id, { actionId: ACTION_ID, version: 1 })(sql))
      return { list: growthOf(sql), newest, oldest }
    })
    expect(list).toEqual({ measurements: [newest, oldest] })
  })

  it("puts the one logged later first when two share a time", async () => {
    const { list, first, second } = await inHousehold((sql) => {
      const first = saved(logMeasurement(stampOf(sql), weighed(NOW - HOUR_MS, 4200))(sql))
      const second = saved(logMeasurement(stampOf(sql), weighed(NOW - HOUR_MS, 4210))(sql))
      return { list: growthOf(sql), first, second }
    })
    expect(list.measurements).toEqual([second, first])
  })
})

describe("the growth_measurements table", () => {
  const insert = (
    sql: SqlStorage,
    metrics: { weightG: number | null; lengthCm: number | null; headCm: number | null },
    measuredAt = NOW,
    source = "app",
    sourceRef: string | null = null,
  ) => {
    const andrew = caregiverId(sql, ANDREW.email)
    sql.exec(
      `INSERT INTO growth_measurements
         (id, measured_at, weight_g, length_cm, head_cm, version, source, source_ref, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      measuredAt,
      metrics.weightG,
      metrics.lengthCm,
      metrics.headCm,
      source,
      sourceRef,
      andrew,
      NOW,
      andrew,
      NOW,
    )
  }
  const weight = { ...NO_METRICS, weightG: 4210.5 }

  it("refuses a measurement with no metric, whatever writes it", async () => {
    await inHousehold((sql) => {
      expect(() => insert(sql, NO_METRICS)).toThrow("CHECK constraint failed")
    })
  })

  it.each([
    ["its minimum", { weightG: 200, lengthCm: 20, headCm: 15 }],
    ["its maximum", { weightG: 40_000, lengthCm: 150, headCm: 70 }],
  ])("takes each metric at %s", async (_label, metrics) => {
    await inHousehold((sql) => {
      insert(sql, metrics)
      expect(sql.exec("SELECT id FROM growth_measurements").toArray()).toHaveLength(1)
    })
  })

  it.each([
    ["a weight under 200 g", { ...NO_METRICS, weightG: 199.9 }],
    ["a weight over 40 kg", { ...NO_METRICS, weightG: 40_000.1 }],
    ["a length under 20 cm", { ...NO_METRICS, lengthCm: 19.9 }],
    ["a length over 150 cm", { ...NO_METRICS, lengthCm: 150.1 }],
    ["a head circumference under 15 cm", { ...NO_METRICS, headCm: 14.9 }],
    ["a head circumference over 70 cm", { ...NO_METRICS, headCm: 70.1 }],
  ])("refuses %s, which the contract can't decode", async (_label, metrics) => {
    await inHousehold((sql) => {
      expect(() => insert(sql, metrics)).toThrow("CHECK constraint failed")
    })
  })

  it.each([
    ["before the years an Instant allows", BEFORE_INSTANTS],
    ["in seconds, not milliseconds", NOW / 1000],
  ])("refuses a time %s", async (_label, measuredAt) => {
    await inHousehold((sql) => {
      expect(() => insert(sql, weight, measuredAt)).toThrow("CHECK constraint failed")
    })
  })

  it("keeps one row per imported source row, and any number of rows from the app (D4)", async () => {
    await inHousehold((sql) => {
      insert(sql, weight)
      insert(sql, weight)
      insert(sql, weight, NOW, "import", "row-7")
      expect(() => insert(sql, weight, NOW, "import", "row-7")).toThrow("UNIQUE constraint failed")
    })
  })

  it.each([
    ["an imported row without its source row", "import", null],
    ["an app row with a source row", "app", "row-7"],
  ])("refuses %s", async (_label, source, sourceRef) => {
    await inHousehold((sql) => {
      expect(() => insert(sql, weight, NOW, source, sourceRef)).toThrow("CHECK constraint failed")
    })
  })
})

describe("a birth date after a measurement", () => {
  it("is refused while the measurement is live, and taken once it's deleted", async () => {
    const { refused, taken } = await inHousehold((sql) => {
      const logged = saved(logMeasurement(stampOf(sql), weighed(SEP_3_BEGINS))(sql))
      const refused = editChild(stampOf(sql), birthDateEdit("2026-09-04"))(sql)
      saved(deleteMeasurement(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 1 })(sql))
      return { refused, taken: editChild(stampOf(sql), birthDateEdit("2026-09-04"))(sql) }
    })
    expect(refused).toMatchObject({
      ok: false,
      error: { _tag: "InvalidInput", fieldErrors: [{ path: "birthDate", issue: "before_birth" }] },
    })
    expect(taken).toMatchObject({ ok: true, response: { birthDate: "2026-09-04" } })
  })
})

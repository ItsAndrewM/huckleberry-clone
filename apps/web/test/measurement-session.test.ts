import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { entryOf } from "../src/features/growth/entry.ts"
import {
  deleteAction,
  isCleared,
  isComplete,
  measuredAtOf,
  measurementSession,
  readingsOf,
  recordOf,
  saveAction,
  valuesOf,
} from "../src/features/growth/measurement-session.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { NOW as NOW_WHEN } from "../src/sheets/when.ts"
import { at, measurement, UNITS, ZONE } from "./growth-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const IMPERIAL = { ...UNITS, weight: "lb_oz", length: "in" } as const
const MEASURED_AT = at("2026-10-06", 10) + 42_123
const STORED = { ...measurement("m3", MEASURED_AT, { weightG: 4300.4, lengthCm: 54.5 }), version: 4 }
const NEWER = { ...STORED, version: 5 }
const NOW = at("2026-10-09", 9)

const failedWith = (sending: Sending): Failed => ({ sending, error: new Offline() })

describe("measurementSession", () => {
  it("starts a new measurement now, empty, in the household's units", () => {
    const session = measurementSession(null, null, IMPERIAL, ZONE, null)
    expect(session).toMatchObject({ target: null, measuredAt: null })
    expect(session.actionId).toMatch(UUID)
    expect(session.form).toEqual({
      when: NOW_WHEN,
      weightG: entryOf(null, "lb_oz"),
      lengthCm: entryOf(null, "in"),
      headCm: entryOf(null, "in"),
    })
  })

  it("starts a new measurement at the time it was opened at, from History's empty slot", () => {
    const session = measurementSession(null, null, UNITS, ZONE, NOW)
    expect(session.form.when).toEqual({ kind: "at", local: "2026-10-09T09:00", pick: null })
  })

  it("opens a measurement for editing at its time on the household's clock, with its values", () => {
    const session = measurementSession(null, STORED, UNITS, ZONE, null)
    expect(session).toMatchObject({ target: { id: "m3", version: 4 }, measuredAt: MEASURED_AT })
    expect(session.form).toEqual({
      when: { kind: "at", local: "2026-10-06T10:00", pick: null },
      weightG: entryOf(4300.4, "kg"),
      lengthCm: entryOf(54.5, "cm"),
      headCm: entryOf(null, "cm"),
    })
  })

  it("reopens a failed new measurement with what was sent, at the time it was sent, under the same actionId", () => {
    const payload = { actionId: ACTION_ID, measuredAt: MEASURED_AT, weightG: 4300, lengthCm: null, headCm: 36.8 }
    const failed = failedWith({ sheet: "measurement", action: { kind: "logMeasurement", payload } })
    const session = measurementSession(failed, null, UNITS, ZONE, null)
    expect(session).toMatchObject({ actionId: ACTION_ID, target: null, measuredAt: MEASURED_AT })
    expect(session.form.headCm).toEqual(entryOf(36.8, "cm"))
    expect(session.form.when).toEqual({ kind: "at", local: "2026-10-06T10:00", pick: null })
  })

  it("reopens a failed edit on the version it was sent against, though the household has moved on", () => {
    const payload = {
      actionId: ACTION_ID,
      version: 4,
      measuredAt: MEASURED_AT,
      weightG: 4400,
      lengthCm: 55,
      headCm: null,
    }
    const failed = failedWith({ sheet: "measurement", action: { kind: "editMeasurement", id: "m3", payload } })
    const session = measurementSession(failed, NEWER, UNITS, ZONE, null)
    expect(session).toMatchObject({ actionId: ACTION_ID, target: { id: "m3", version: 4 } })
    expect(session.form.weightG).toEqual(entryOf(4400, "kg"))
    expect(session.form.when).toEqual({ kind: "at", local: "2026-10-06T10:00", pick: null })
  })

  it("reopens a failed delete as an edit of the cached measurement, on its version and under a fresh actionId", () => {
    const action = { kind: "deleteMeasurement", id: "m3", payload: { actionId: ACTION_ID, version: 4 } } as const
    const session = measurementSession(failedWith({ sheet: "measurement", action }), NEWER, UNITS, ZONE, null)
    expect(session.target).toEqual({ id: "m3", version: 5 })
    expect(session.actionId).not.toBe(ACTION_ID)
    expect(session.form.when).toEqual({ kind: "at", local: "2026-10-06T10:00", pick: null })
  })
})

describe("readings", () => {
  const form = measurementSession(null, null, UNITS, ZONE, null).form

  it("is complete with one value and nothing unreadable", () => {
    expect(isComplete(readingsOf(form))).toBe(false)
    expect(isComplete(readingsOf({ ...form, weightG: { ...form.weightG, text: "4.3" } }))).toBe(true)
    const unreadable = { ...form, weightG: { ...form.weightG, text: "4.3" }, headCm: { ...form.headCm, text: "x" } }
    expect(isComplete(readingsOf(unreadable))).toBe(false)
  })

  it("gives the values in grams and centimetres, null where empty", () => {
    const typed = { ...form, weightG: { ...form.weightG, text: "4.3" }, headCm: { ...form.headCm, text: "36.8" } }
    expect(valuesOf(readingsOf(typed))).toEqual({ weightG: 4300, lengthCm: null, headCm: 36.8 })
  })

  it("gives an untouched edit's values exactly as stored", () => {
    const editing = measurementSession(null, STORED, UNITS, ZONE, null)
    expect(valuesOf(readingsOf(editing.form))).toEqual({ weightG: 4300.4, lengthCm: 54.5, headCm: null })
  })

  it("empties only the metric whose box was cleared", () => {
    const editing = measurementSession(null, STORED, UNITS, ZONE, null)
    const partlyCleared = { ...editing.form, weightG: { ...editing.form.weightG, text: "" } }
    expect(valuesOf(readingsOf(partlyCleared))).toEqual({ weightG: null, lengthCm: 54.5, headCm: null })
  })

  it("holds length and head circumference to their own limits", () => {
    const typed = { ...form, lengthCm: { ...form.lengthCm, text: "75" }, headCm: { ...form.headCm, text: "75" } }
    expect(readingsOf(typed)).toEqual({
      weightG: { kind: "empty" },
      lengthCm: { kind: "value", value: 75 },
      headCm: { kind: "invalid", issue: "out_of_range" },
    })
  })

  it("counts an edit with every value cleared as a delete, but never a new measurement", () => {
    const editing = measurementSession(null, STORED, UNITS, ZONE, null)
    const cleared = {
      ...editing.form,
      weightG: { ...editing.form.weightG, text: "" },
      lengthCm: { ...editing.form.lengthCm, text: "" },
    }
    expect(isCleared(editing, readingsOf(cleared))).toBe(true)
    expect(isCleared(editing, readingsOf(editing.form))).toBe(false)
    const fresh = measurementSession(null, null, UNITS, ZONE, null)
    expect(isCleared(fresh, readingsOf(fresh.form))).toBe(false)
  })
})

describe("measuredAtOf", () => {
  it("sends an untouched time back to the millisecond", () => {
    const session = measurementSession(null, STORED, UNITS, ZONE, null)
    expect(measuredAtOf(session, session.form.when, ZONE, NOW)).toEqual({ ok: true, instant: MEASURED_AT })
  })

  it("reads a changed time on the household's clock", () => {
    const session = measurementSession(null, STORED, UNITS, ZONE, null)
    const when = { kind: "at", local: "2026-10-06T11:30", pick: null } as const
    expect(measuredAtOf(session, when, ZONE, NOW)).toEqual({
      ok: true,
      instant: Date.parse("2026-10-06T11:30:00-07:00"),
    })
  })

  it("takes now for a new measurement left at Now", () => {
    const session = measurementSession(null, null, UNITS, ZONE, null)
    expect(measuredAtOf(session, NOW_WHEN, ZONE, NOW)).toEqual({ ok: true, instant: NOW })
  })
})

describe("actions", () => {
  const values = { weightG: 4300, lengthCm: null, headCm: 36.8 }

  it("logs a new measurement, and edits one on its version", () => {
    const fresh = { ...measurementSession(null, null, UNITS, ZONE, null), actionId: ACTION_ID }
    expect(saveAction(fresh, values, NOW)).toEqual({
      kind: "logMeasurement",
      payload: { actionId: ACTION_ID, measuredAt: NOW, ...values },
    })
    const editing = { ...measurementSession(null, STORED, UNITS, ZONE, null), actionId: ACTION_ID }
    expect(saveAction(editing, values, NOW)).toEqual({
      kind: "editMeasurement",
      id: "m3",
      payload: { actionId: ACTION_ID, version: 4, measuredAt: NOW, ...values },
    })
  })

  it("deletes on the version, under its own actionId", () => {
    const action = deleteAction({ id: "m3", version: 4 })
    expect(action).toMatchObject({ kind: "deleteMeasurement", id: "m3", payload: { version: 4 } })
    expect(action.payload.actionId).toMatch(UUID)
  })
})

describe("recordOf", () => {
  const heldNew = failedWith({
    sheet: "measurement",
    action: {
      kind: "logMeasurement",
      payload: { actionId: ACTION_ID, measuredAt: NOW, weightG: 4300, lengthCm: null, headCm: null },
    },
  })
  const heldDelete = failedWith({
    sheet: "measurement",
    action: { kind: "deleteMeasurement", id: "m3", payload: { actionId: ACTION_ID, version: 4 } },
  })

  it("opens the record a card asked for when the sheet holds nothing", () => {
    expect(recordOf(null, "m2")).toBe("m2")
    expect(recordOf(null, null)).toBeNull()
  })

  it("opens a held change to a record on that record, whatever a card asked for last", () => {
    expect(recordOf(heldDelete, "m2")).toBe("m3")
  })

  it("opens a held new measurement as one to add, even after a card's edit", () => {
    expect(recordOf(heldNew, "m2")).toBeNull()
  })
})

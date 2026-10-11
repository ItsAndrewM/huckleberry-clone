import { describe, expect, it } from "vitest"
import { pendingGrowth, savedGrowth, withdrawnGrowth } from "../src/api/growth-cache.ts"
import { pendingId } from "../src/api/pending.ts"
import { at, MEASUREMENTS, measurement } from "./growth-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const OTHER_ID = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"
const ANDREW = "caregiver-andrew"
const NOW = at("2026-10-09", 9)
const AUTHOR = { by: ANDREW, now: NOW }
const GROWTH = { measurements: MEASUREMENTS }
const ids = ({ measurements }: { readonly measurements: ReadonlyArray<{ readonly id: string }> }) =>
  measurements.map(({ id }) => id)

const logged = (measuredAt: number, actionId = ACTION_ID) =>
  ({
    kind: "logMeasurement",
    payload: { actionId, measuredAt, weightG: 3900, lengthCm: null, headCm: null },
  }) as const

const DELETED_M2 = { kind: "deleteMeasurement", id: "m2", payload: { actionId: ACTION_ID, version: 1 } } as const

describe("pendingGrowth", () => {
  it("lists a new measurement at once, in its place by time, newest first", () => {
    const growth = pendingGrowth(GROWTH, logged(at("2026-09-20", 10)), AUTHOR)
    expect(ids(growth)).toEqual(["m3", pendingId(ACTION_ID), "m2", "m1"])
    expect(growth.measurements[1]).toMatchObject({ weightG: 3900, createdBy: ANDREW, createdAt: NOW, deletedAt: null })
  })

  it("puts a new measurement ahead of one taken at the same moment, as the household lists it", () => {
    expect(ids(pendingGrowth(GROWTH, logged(at("2026-09-15", 10)), AUTHOR))).toEqual([
      "m3",
      pendingId(ACTION_ID),
      "m2",
      "m1",
    ])
  })

  it("shows an edit at once, moved to its new time", () => {
    const payload = {
      actionId: ACTION_ID,
      version: 1,
      measuredAt: at("2026-10-07", 8),
      weightG: 3150,
      lengthCm: 49.5,
      headCm: 34,
    }
    const growth = pendingGrowth(GROWTH, { kind: "editMeasurement", id: "m1", payload }, AUTHOR)
    expect(ids(growth)).toEqual(["m1", "m3", "m2"])
    expect(growth.measurements[0]).toMatchObject({ weightG: 3150, version: 1, updatedBy: ANDREW, updatedAt: NOW })
  })

  it("leaves the list alone for an edit of a measurement it doesn't hold", () => {
    const payload = { actionId: ACTION_ID, version: 1, measuredAt: NOW, weightG: 3150, lengthCm: null, headCm: null }
    expect(pendingGrowth(GROWTH, { kind: "editMeasurement", id: "gone", payload }, AUTHOR)).toBe(GROWTH)
  })

  it("takes a deleted measurement off the list at once", () => {
    expect(ids(pendingGrowth(GROWTH, DELETED_M2, AUTHOR))).toEqual(["m3", "m1"])
  })
})

describe("savedGrowth", () => {
  it("swaps the pending measurement for the household's answer", () => {
    const action = logged(at("2026-09-20", 10))
    const pending = pendingGrowth(GROWTH, action, AUTHOR)
    const answer = measurement("m4", at("2026-09-20", 10), { weightG: 3900 })
    expect(ids(savedGrowth(pending, { measurement: answer, changed: [] }, action))).toEqual(["m3", "m4", "m2", "m1"])
  })

  it("takes a measurement the household answers as deleted off the list", () => {
    const deleted = { ...measurement("m2", at("2026-09-15", 10), { weightG: 3600 }), version: 2, deletedAt: NOW }
    expect(ids(savedGrowth(GROWTH, { measurement: deleted, changed: [] }, DELETED_M2))).toEqual(["m3", "m1"])
  })
})

describe("withdrawnGrowth", () => {
  it("takes back only the new measurement whose save failed", () => {
    const failed = logged(at("2026-09-20", 10))
    const still = logged(at("2026-10-08", 10), OTHER_ID)
    const shown = pendingGrowth(pendingGrowth(GROWTH, failed, AUTHOR), still, AUTHOR)
    expect(ids(withdrawnGrowth(shown, failed, GROWTH))).toEqual([pendingId(OTHER_ID), "m3", "m2", "m1"])
  })

  it("puts an edited measurement back as it was, in its place", () => {
    const measuredAt = at("2026-10-07", 8)
    const payload = { actionId: ACTION_ID, version: 1, measuredAt, weightG: 3150, lengthCm: null, headCm: null }
    const action = { kind: "editMeasurement", id: "m1", payload } as const
    expect(withdrawnGrowth(pendingGrowth(GROWTH, action, AUTHOR), action, GROWTH)).toEqual(GROWTH)
  })

  it("puts a deleted measurement back in its place", () => {
    expect(withdrawnGrowth(pendingGrowth(GROWTH, DELETED_M2, AUTHOR), DELETED_M2, GROWTH)).toEqual(GROWTH)
  })

  it("keeps a newer version the household sent while the save was failing", () => {
    const newer = { ...measurement("m2", at("2026-09-15", 10), { weightG: 3650 }), version: 2 }
    const refetched = { measurements: MEASUREMENTS.map((stored) => (stored.id === "m2" ? newer : stored)) }
    expect(withdrawnGrowth(refetched, DELETED_M2, GROWTH)).toBe(refetched)
  })
})

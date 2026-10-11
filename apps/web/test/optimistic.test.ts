import { queryKeys, type Today } from "@bt/contracts"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { pendIn, rollBack, settle } from "../src/api/optimistic.ts"
import { pendingId } from "../src/api/pending.ts"
import { at, MEASUREMENTS, measurement, meWith } from "./growth-fixtures.ts"
import { diaperAt, todayWith } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const OTHER_ID = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"
const NOW = at("2026-10-09", 9)
const LOG: Action = {
  kind: "logMeasurement",
  payload: { actionId: ACTION_ID, measuredAt: NOW, weightG: 4500, lengthCm: null, headCm: null },
}
const OTHER_LOG: Action = {
  kind: "logMeasurement",
  payload: { actionId: OTHER_ID, measuredAt: NOW - 60_000, weightG: 4400, lengthCm: null, headCm: null },
}
const EDIT_M1: Action = {
  kind: "editMeasurement",
  id: "m1",
  payload: {
    actionId: ACTION_ID,
    version: 1,
    measuredAt: at("2026-10-07", 8),
    weightG: 3150,
    lengthCm: null,
    headCm: null,
  },
}
const EDIT_GONE: Action = {
  kind: "editMeasurement",
  id: "gone",
  payload: { actionId: ACTION_ID, version: 1, measuredAt: NOW, weightG: 4500, lengthCm: null, headCm: null },
}
const DELETE_GONE: Action = {
  kind: "deleteMeasurement",
  id: "gone",
  payload: { actionId: ACTION_ID, version: 1 },
}
const DIAPER: Action = {
  kind: "logDiaper",
  payload: { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false },
}

const householdCache = () => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(queryKeys.me, meWith())
  queryClient.setQueryData(queryKeys.growth, { measurements: MEASUREMENTS })
  queryClient.setQueryData(queryKeys.today, todayWith())
  return queryClient
}

const growthIds = (queryClient: QueryClient) =>
  queryClient
    .getQueryData<{ readonly measurements: ReadonlyArray<{ readonly id: string }> }>(queryKeys.growth)
    ?.measurements.map(({ id }) => id)

const recentIds = (queryClient: QueryClient) =>
  queryClient
    .getQueryData<Today>(queryKeys.today)
    ?.recent.map((entry) => (entry.kind === "diaper" ? entry.diaper.id : entry.feed.id))

describe("optimistic measurements", () => {
  it("lists a measurement being saved in the growth cache, and leaves Today alone", async () => {
    const queryClient = householdCache()
    const today = queryClient.getQueryData(queryKeys.today)
    expect(await pendIn(queryClient, LOG, NOW)).toEqual({ cache: "growth", before: { measurements: MEASUREMENTS } })
    expect(growthIds(queryClient)).toEqual([pendingId(ACTION_ID), "m3", "m2", "m1"])
    expect(queryClient.getQueryData(queryKeys.today)).toBe(today)
  })

  it("takes back only its own measurement, and marks the list for a refetch, when the save fails", async () => {
    const queryClient = householdCache()
    const pended = await pendIn(queryClient, LOG, NOW)
    await pendIn(queryClient, OTHER_LOG, NOW)
    rollBack(queryClient, LOG, pended)
    expect(growthIds(queryClient)).toEqual([pendingId(OTHER_ID), "m3", "m2", "m1"])
    expect(queryClient.getQueryState(queryKeys.growth)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(queryKeys.today)?.isInvalidated).toBe(false)
  })

  it("puts an edited measurement back as it was when its save fails", async () => {
    const queryClient = householdCache()
    const pended = await pendIn(queryClient, EDIT_M1, NOW)
    expect(growthIds(queryClient)).toEqual(["m1", "m3", "m2"])
    rollBack(queryClient, EDIT_M1, pended)
    expect(queryClient.getQueryData(queryKeys.growth)).toEqual({ measurements: MEASUREMENTS })
  })

  it("swaps in the household's answer, and refreshes what it says changed", async () => {
    const queryClient = householdCache()
    await pendIn(queryClient, LOG, NOW)
    const answer = measurement("m4", NOW, { weightG: 4500 })
    settle(queryClient, { measurement: answer, changed: [queryKeys.growth, ["day", "2026-10-09"]] }, LOG)
    expect(growthIds(queryClient)).toEqual(["m4", "m3", "m2", "m1"])
    expect(queryClient.getQueryState(queryKeys.growth)?.isInvalidated).toBe(true)
  })

  it("changes nothing before the household's me has loaded", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.growth, { measurements: MEASUREMENTS })
    expect(await pendIn(queryClient, LOG, NOW)).toBeNull()
    expect(growthIds(queryClient)).toEqual(["m3", "m2", "m1"])
  })

  it.each([
    { label: "an edit", action: EDIT_GONE },
    { label: "a delete", action: DELETE_GONE },
  ])("changes nothing for $label of a measurement the list doesn't have", async ({ action }) => {
    const queryClient = householdCache()
    const growth = queryClient.getQueryData(queryKeys.growth)
    expect(await pendIn(queryClient, action, NOW)).toBeNull()
    expect(queryClient.getQueryData(queryKeys.growth)).toBe(growth)
  })
})

describe("optimistic Today", () => {
  it("still writes a diaper into Today, not the growth cache", async () => {
    const queryClient = householdCache()
    expect((await pendIn(queryClient, DIAPER, NOW))?.cache).toBe("today")
    expect(growthIds(queryClient)).toEqual(["m3", "m2", "m1"])
  })

  it("takes a failed diaper back out of Today, and marks Today, not the growth list, for a refetch", async () => {
    const queryClient = householdCache()
    const pended = await pendIn(queryClient, DIAPER, NOW)
    expect(recentIds(queryClient)).toEqual([pendingId(ACTION_ID)])
    rollBack(queryClient, DIAPER, pended)
    expect(recentIds(queryClient)).toEqual([])
    expect(queryClient.getQueryState(queryKeys.today)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(queryKeys.growth)?.isInvalidated).toBe(false)
  })

  it("swaps a saved diaper into Today, and leaves the growth cache as it was", async () => {
    const queryClient = householdCache()
    const growth = queryClient.getQueryData(queryKeys.growth)
    await pendIn(queryClient, DIAPER, NOW)
    settle(queryClient, { diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] }, DIAPER)
    expect(recentIds(queryClient)).toEqual(["diaper-1"])
    expect(queryClient.getQueryData(queryKeys.growth)).toBe(growth)
  })
})

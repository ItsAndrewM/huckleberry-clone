import { queryKeys } from "@bt/contracts"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { pendIn, rollBack, settle } from "../src/api/optimistic.ts"
import { pendingId } from "../src/api/pending.ts"
import { at, MEASUREMENTS, measurement, meWith } from "./growth-fixtures.ts"
import { todayWith } from "./today-fixtures.ts"

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

describe("optimistic measurements", () => {
  it("lists a measurement being saved in the growth cache, and leaves Today alone", async () => {
    const queryClient = householdCache()
    const today = queryClient.getQueryData(queryKeys.today)
    expect(await pendIn(queryClient, LOG, NOW)).toEqual({ cache: "growth", before: { measurements: MEASUREMENTS } })
    expect(growthIds(queryClient)).toEqual([pendingId(ACTION_ID), "m3", "m2", "m1"])
    expect(queryClient.getQueryData(queryKeys.today)).toBe(today)
  })

  it("takes back only its own measurement, and refetches the list, when the save fails", async () => {
    const queryClient = householdCache()
    const pended = await pendIn(queryClient, LOG, NOW)
    await pendIn(queryClient, OTHER_LOG, NOW)
    rollBack(queryClient, LOG, pended)
    expect(growthIds(queryClient)).toEqual([pendingId(OTHER_ID), "m3", "m2", "m1"])
    expect(queryClient.getQueryState(queryKeys.growth)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(queryKeys.today)?.isInvalidated).toBe(false)
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

  it("still writes a diaper into Today, not the growth cache", async () => {
    const queryClient = householdCache()
    const diaper: Action = {
      kind: "logDiaper",
      payload: { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false },
    }
    expect((await pendIn(queryClient, diaper, NOW))?.cache).toBe("today")
    expect(growthIds(queryClient)).toEqual(["m3", "m2", "m1"])
  })
})

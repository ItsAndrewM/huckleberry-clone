import { type Me, queryKeys } from "@bt/contracts"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { refreshPeriodsOnZoneChange } from "../src/api/zone-change.ts"
import { meWith } from "./growth-fixtures.ts"

const ME = meWith()
const PERIODS = [queryKeys.day("2026-10-12"), queryKeys.week("2026-W42"), queryKeys.month("2026-10")]
const CACHED = [...PERIODS, queryKeys.today, queryKeys.last24h, queryKeys.growth]

const inZone = (timeZone: string): Me => ({ ...ME, household: { ...ME.household, timeZone } })

const phone = (me: Me | null = ME) => {
  const queryClient = new QueryClient()
  if (me !== null) queryClient.setQueryData(queryKeys.me, me)
  refreshPeriodsOnZoneChange(queryClient)
  for (const queryKey of CACHED) queryClient.setQueryData(queryKey, "cached")
  const refetching = () => CACHED.filter((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated === true)
  return { queryClient, refetching }
}

describe("refreshPeriodsOnZoneChange", () => {
  it("refreshes every cached day, week and month when this phone saves a new zone, and nothing else", () => {
    const { queryClient, refetching } = phone()
    queryClient.setQueryData(queryKeys.me, inZone("Europe/London"))
    expect(refetching()).toEqual(PERIODS)
  })

  it("refreshes them when the other phone's change comes back in a refetch of me", async () => {
    const { queryClient, refetching } = phone()
    await queryClient.fetchQuery({ queryKey: queryKeys.me, staleTime: 0, queryFn: async () => inZone("Asia/Tokyo") })
    expect(refetching()).toEqual(PERIODS)
  })

  it("leaves them alone when me changes but the zone doesn't", () => {
    const { queryClient, refetching } = phone()
    queryClient.setQueryData(queryKeys.me, { ...ME, household: { ...ME.household, name: "Home" } })
    expect(refetching()).toEqual([])
  })

  it("leaves them alone when me first arrives, since nothing was cached in another zone", () => {
    const { queryClient, refetching } = phone(null)
    queryClient.setQueryData(queryKeys.me, inZone("Europe/London"))
    expect(refetching()).toEqual([])
  })

  it("refreshes them once for one change, however many updates follow", () => {
    const { queryClient, refetching } = phone()
    queryClient.setQueryData(queryKeys.me, inZone("Europe/London"))
    for (const queryKey of PERIODS) queryClient.setQueryData(queryKey, "refetched in London")
    queryClient.setQueryData(queryKeys.me, { ...inZone("Europe/London"), caregiver: ME.caregiver })
    expect(refetching()).toEqual([])
  })
})

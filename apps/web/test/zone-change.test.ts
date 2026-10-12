import { type Me, queryKeys } from "@bt/contracts"
import { QueryClient, type QueryKey, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
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
  const invalidated = () => CACHED.filter((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated === true)
  return { queryClient, invalidated }
}

const onScreen = (queryClient: QueryClient, queryKey: QueryKey) => {
  let fetches = 0
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn: () => {
      fetches += 1
      return `fetch ${fetches}`
    },
  })
  const stop = observer.subscribe(() => undefined)
  const shows = () => {
    const { data, error } = observer.getCurrentResult()
    return { fetches, data, error }
  }
  return { shows, stop }
}

const settled = (queryClient: QueryClient) => vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))

describe("refreshPeriodsOnZoneChange", () => {
  it("refreshes every cached day, week and month when this phone saves a new zone, and nothing else", () => {
    const { queryClient, invalidated } = phone()
    queryClient.setQueryData(queryKeys.me, inZone("Europe/London"))
    expect(invalidated()).toEqual(PERIODS)
  })

  it("refreshes them when the other phone's change comes back in a refetch of me", async () => {
    const { queryClient, invalidated } = phone()
    await queryClient.fetchQuery({ queryKey: queryKeys.me, staleTime: 0, queryFn: async () => inZone("Asia/Tokyo") })
    expect(invalidated()).toEqual(PERIODS)
  })

  it("leaves them alone when me changes but the zone doesn't", () => {
    const { queryClient, invalidated } = phone()
    queryClient.setQueryData(queryKeys.me, { ...ME, household: { ...ME.household, name: "Home" } })
    expect(invalidated()).toEqual([])
  })

  it("leaves them alone when me first arrives, since nothing was cached in another zone", () => {
    const { queryClient, invalidated } = phone(null)
    queryClient.setQueryData(queryKeys.me, inZone("Europe/London"))
    expect(invalidated()).toEqual([])
  })

  it("fetches each day, week and month on screen just once more, since it takes the new zone before the fetches it starts update the cache it watches", async () => {
    const { queryClient } = phone()
    const screens = PERIODS.map((queryKey) => onScreen(queryClient, queryKey))
    const shown = () => screens.map((screen) => screen.shows())
    await settled(queryClient)
    expect(shown()).toEqual(Array(3).fill({ fetches: 1, data: "fetch 1", error: null }))
    queryClient.setQueryData(queryKeys.me, inZone("Europe/London"))
    await settled(queryClient)
    expect(shown()).toEqual(Array(3).fill({ fetches: 2, data: "fetch 2", error: null }))
    for (const screen of screens) screen.stop()
  })

  it("refreshes them once for one change, however many updates follow", () => {
    const { queryClient, invalidated } = phone()
    queryClient.setQueryData(queryKeys.me, inZone("Europe/London"))
    for (const queryKey of PERIODS) queryClient.setQueryData(queryKey, "refetched in London")
    queryClient.setQueryData(queryKeys.me, { ...inZone("Europe/London"), caregiver: ME.caregiver })
    expect(invalidated()).toEqual([])
  })
})

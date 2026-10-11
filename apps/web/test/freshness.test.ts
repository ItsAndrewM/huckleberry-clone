import { QueryClient, type QueryKey, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { createConnectivity } from "../src/api/connectivity.ts"
import { trackFreshness } from "../src/api/freshness.ts"
import { MINUTE, NOW } from "./today-fixtures.ts"

const TODAY = ["today"]
const LAST_24H = ["last24h"]
const GROWTH = ["growth"]
const OFFLINE_COPY = ["offline-copy", "build-1"]

const refused = () => Promise.reject(new Error("no connection"))

const household = () => {
  let clock = NOW
  const connectivity = createConnectivity(true, () => clock)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  })
  const freshness = trackFreshness(client.getQueryCache(), connectivity)
  const answers = async (queryKey: QueryKey, at: number) => {
    clock = at
    await client.fetchQuery({
      queryKey,
      staleTime: 0,
      queryFn: async () => {
        connectivity.report("answered")
        return { at }
      },
    })
  }
  const refuses = async (queryKey: QueryKey, at: number) => {
    clock = at
    await client.fetchQuery({ queryKey, staleTime: 0, queryFn: refused }).catch(() => undefined)
  }
  const hears = (at: number) => {
    clock = at
    connectivity.report("heard")
  }
  const fallsBehind = async (queryKey: QueryKey, at: number) => {
    clock = at
    await client.invalidateQueries({ queryKey, refetchType: "none" })
  }
  const shows = (queryKey: QueryKey) => new QueryObserver(client, { queryKey, queryFn: refused }).subscribe(() => {})
  return { client, connectivity, freshness, answers, refuses, hears, fallsBehind, shows }
}

describe("trackFreshness", () => {
  it("is when the household last answered or spoke, while every query on screen is up to date", async () => {
    const { freshness, answers, hears, shows } = household()
    await answers(TODAY, NOW)
    shows(TODAY)
    hears(NOW + 10 * MINUTE)
    expect(freshness.updatedAt()).toBe(NOW + 10 * MINUTE)
  })

  it("holds at the last word before a query on screen fell behind, until the household answers it again", async () => {
    const { freshness, answers, hears, fallsBehind, shows } = household()
    await answers(TODAY, NOW)
    shows(TODAY)
    hears(NOW + 11 * MINUTE)
    await fallsBehind(TODAY, NOW + 12 * MINUTE)
    hears(NOW + 13 * MINUTE)
    expect(freshness.updatedAt()).toBe(NOW + 11 * MINUTE)
    await answers(TODAY, NOW + 15 * MINUTE)
    expect(freshness.updatedAt()).toBe(NOW + 15 * MINUTE)
  })

  it("counts a failed fetch as falling behind, and keeps the first mark through later failures", async () => {
    const { freshness, answers, refuses, hears, shows } = household()
    await answers(TODAY, NOW)
    shows(TODAY)
    hears(NOW + 11 * MINUTE)
    await refuses(TODAY, NOW + 12 * MINUTE)
    hears(NOW + 13 * MINUTE)
    await refuses(TODAY, NOW + 14 * MINUTE)
    expect(freshness.updatedAt()).toBe(NOW + 11 * MINUTE)
  })

  it("isn't moved by the app's own edits, such as a save shown before the household has it", async () => {
    const { client, freshness, answers, hears, fallsBehind, shows } = household()
    await answers(TODAY, NOW)
    shows(TODAY)
    await fallsBehind(TODAY, NOW + 12 * MINUTE)
    client.setQueryData(TODAY, { at: "edited here" })
    hears(NOW + 13 * MINUTE)
    expect(freshness.updatedAt()).toBe(NOW)
  })

  it("leaves out what no screen shows, and what the app keeps for itself, such as the offline copy", async () => {
    const { client, freshness, answers, refuses, hears, fallsBehind, shows } = household()
    await answers(TODAY, NOW)
    shows(TODAY)
    await answers(GROWTH, NOW)
    await fallsBehind(GROWTH, NOW + MINUTE)
    await client.fetchQuery({ queryKey: OFFLINE_COPY, queryFn: async () => "saved" })
    shows(OFFLINE_COPY)
    await refuses(OFFLINE_COPY, NOW + 2 * MINUTE)
    hears(NOW + 10 * MINUTE)
    expect(freshness.updatedAt()).toBe(NOW + 10 * MINUTE)
  })

  it("leaves out a query on screen with nothing to show yet, and says nothing while none has", async () => {
    const { freshness, answers, hears, shows } = household()
    hears(NOW)
    shows(LAST_24H)
    expect(freshness.updatedAt()).toBeNull()
    await answers(TODAY, NOW + MINUTE)
    shows(TODAY)
    expect(freshness.updatedAt()).toBe(NOW + MINUTE)
  })

  it("tells its listeners when a query falls behind or the connection changes, until they stop listening", async () => {
    const { connectivity, freshness, answers, fallsBehind, shows } = household()
    await answers(TODAY, NOW)
    shows(TODAY)
    let told = 0
    const stop = freshness.subscribe(() => {
      told += 1
    })
    await fallsBehind(TODAY, NOW + MINUTE)
    expect(told).toBeGreaterThan(0)
    told = 0
    connectivity.report("offline")
    expect(told).toBe(1)
    stop()
    connectivity.report("online")
    expect(told).toBe(1)
  })
})

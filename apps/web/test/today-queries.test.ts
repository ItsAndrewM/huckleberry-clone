import { QueryClient } from "@tanstack/react-query"
import type { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { last24hQuery, NEXT_DAY_RETRY_MS, todayQuery, untilNextDay } from "../src/api/today.ts"
import { diaperAt, NO_TOTALS, NOW, todayWith } from "./today-fixtures.ts"

const ORIGIN = "https://bt.example.test"

const householdAnswering = (body: Schema.Json) => {
  const asked: string[] = []
  const api = connectApi({
    baseUrl: ORIGIN,
    report: () => undefined,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      asked.push(`${request.method} ${new URL(request.url).pathname}`)
      return Response.json(body)
    },
  })
  return { api, asked }
}

describe("todayQuery", () => {
  it("asks the household for today, skipping a recent entry of a kind this app doesn't know yet", async () => {
    const diaper = diaperAt(NOW)
    const today = todayWith({ recent: [{ kind: "diaper", diaper }] })
    const { api, asked } = householdAnswering({
      ...today,
      recent: [
        { kind: "sleep", sleep: { id: "sleep-1" } },
        { kind: "diaper", diaper },
      ],
    })
    await expect(new QueryClient().fetchQuery(todayQuery(api))).resolves.toEqual(today)
    expect(asked).toEqual(["GET /api/today"])
  })
})

describe("last24hQuery", () => {
  it("asks the household for the totals of the last 24 hours", async () => {
    const last24h = { from: NOW - 24 * 60 * 60_000, totals: NO_TOTALS }
    const { api, asked } = householdAnswering(last24h)
    await expect(new QueryClient().fetchQuery(last24hQuery(api))).resolves.toEqual(last24h)
    expect(asked).toEqual(["GET /api/last24h"])
  })
})

describe("untilNextDay", () => {
  const ZONE = "America/Vancouver"
  const HOUR = 60 * 60_000

  it("waits until the household's next midnight", () => {
    expect(untilNextDay({ date: "2026-10-09" }, ZONE, Date.UTC(2026, 9, 9, 16, 30))).toBe(14.5 * HOUR)
  })

  it("waits 25 hours from the midnight before the clocks go back, where they still do", () => {
    expect(untilNextDay({ date: "2026-11-01" }, "America/Los_Angeles", Date.UTC(2026, 10, 1, 7))).toBe(25 * HOUR)
  })

  it("waits 23 hours from the midnight before the clocks go forward", () => {
    expect(untilNextDay({ date: "2026-03-08" }, ZONE, Date.UTC(2026, 2, 8, 8))).toBe(23 * HOUR)
  })

  it("asks again a minute later while the household still answers with a day that's over", () => {
    expect(untilNextDay({ date: "2026-10-09" }, ZONE, Date.UTC(2026, 9, 10, 7, 0, 5))).toBe(NEXT_DAY_RETRY_MS)
    expect(NEXT_DAY_RETRY_MS).toBe(60_000)
  })
})

import { QueryClient } from "@tanstack/react-query"
import type { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { last24hQuery, todayQuery } from "../src/api/today.ts"
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

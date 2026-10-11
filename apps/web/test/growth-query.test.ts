import { QueryClient } from "@tanstack/react-query"
import type { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { growthQuery } from "../src/api/growth.ts"
import { MEASUREMENTS } from "./growth-fixtures.ts"

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

describe("growthQuery", () => {
  it("asks the household for its live measurements, under the key the socket's refresh names", async () => {
    const growth = { measurements: MEASUREMENTS }
    const { api, asked } = householdAnswering(growth)
    const query = growthQuery(api)
    await expect(new QueryClient().fetchQuery(query)).resolves.toEqual(growth)
    expect(asked).toEqual(["GET /api/growth"])
    expect(query.queryKey).toEqual(["growth"])
  })
})

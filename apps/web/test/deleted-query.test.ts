import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { deletedQuery } from "../src/api/deleted.ts"
import { diaperAt, NOW } from "./today-fixtures.ts"

const ORIGIN = "https://bt.example.test"

describe("deletedQuery", () => {
  it("asks the household for its recently deleted entries, under the key every delete and restore names", async () => {
    const deleted = {
      feeds: [],
      diapers: [diaperAt(NOW, { version: 2, deletedAt: NOW })],
      sleeps: [],
      measurements: [],
    }
    const asked: string[] = []
    const api = connectApi({
      baseUrl: ORIGIN,
      report: () => undefined,
      fetch: async (input, init) => {
        const request = new Request(input, init)
        asked.push(`${request.method} ${new URL(request.url).pathname}`)
        return Response.json(deleted)
      },
    })
    const query = deletedQuery(api)
    await expect(new QueryClient().fetchQuery(query)).resolves.toEqual(deleted)
    expect(asked).toEqual(["GET /api/deleted"])
    expect(query.queryKey).toEqual(["deleted"])
  })
})

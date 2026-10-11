import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { retryOf } from "../src/api/retry.ts"

const counted = (client: QueryClient, key: string) => {
  let fetched = 0
  const observer = new QueryObserver(client, {
    queryKey: [key],
    queryFn: () => {
      fetched += 1
      return fetched
    },
  })
  return { result: () => observer.getCurrentResult(), fetched: () => fetched }
}

describe("retryOf", () => {
  it("asks every query it was given again", async () => {
    const client = new QueryClient()
    const me = counted(client, "me")
    const today = counted(client, "today")
    retryOf(me.result(), today.result()).run()
    await vi.waitFor(() => expect([me.fetched(), today.fetched()]).toEqual([1, 1]))
  })

  it("is running while any of its queries is fetching", () => {
    const client = new QueryClient()
    const idle = counted(client, "me").result()
    expect(retryOf(idle, idle).running).toBe(false)
    expect(retryOf(idle, { ...idle, isFetching: true }).running).toBe(true)
  })
})

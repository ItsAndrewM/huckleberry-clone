import { InvalidInput, queryKeys, ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { onlineManager, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"
import { meQuery } from "../src/api/me.ts"
import { createQueryClient, retryTransient } from "../src/api/query-client.ts"

const json = { "content-type": "application/json" }
const meFor = (email: string) =>
  JSON.stringify({
    caregiver: { id: email, email, displayName: email },
    household: { name: "Home", timeZone: "America/Vancouver", caregivers: [] },
    child: { name: "Robin", birthDate: "2026-09-01" },
  })

describe("retryTransient", () => {
  it.each([
    [new ServiceUnavailable(), true],
    [new Unexpected({ status: 502 }), true],
    [new Unexpected({ status: 404 }), false],
    [new Unexpected({ status: null }), false],
    [new Offline(), false],
    [new AuthRequired(), false],
    [new Unauthorized(), false],
    [new InvalidInput({ fieldErrors: [] }), false],
  ])("retries %o: %s", (error, retried) => {
    expect(retryTransient(0, error)).toBe(retried)
  })

  it("gives up after three tries", () => {
    expect([0, 1, 2, 3].map((failures) => retryTransient(failures, new ServiceUnavailable()))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })
})

describe("meQuery", () => {
  const signedInAs = () => {
    let email = "andrew@example.test"
    const api = connectApi({
      baseUrl: "https://bt.example.test",
      report: () => undefined,
      fetch: async () => new Response(meFor(email), { headers: { "content-type": "application/json" } }),
    })
    const signInAs = (next: string) => {
      email = next
    }
    return { api, signInAs }
  }

  it("keeps everything cached while the same caregiver stays signed in", async () => {
    const queryClient = createQueryClient()
    const { api } = signedInAs()
    await queryClient.fetchQuery(meQuery(api, queryClient))
    queryClient.setQueryData(queryKeys.today, "today's data")
    await queryClient.fetchQuery({ ...meQuery(api, queryClient), staleTime: 0 })
    expect(queryClient.getQueryData(queryKeys.today)).toBe("today's data")
  })

  it("drops everything cached for the last caregiver when another one signs in on this phone", async () => {
    const queryClient = createQueryClient()
    const { api, signInAs } = signedInAs()
    await queryClient.fetchQuery(meQuery(api, queryClient))
    queryClient.setQueryData(queryKeys.today, "andrew's today")
    signInAs("emily@example.test")
    const me = await queryClient.fetchQuery({ ...meQuery(api, queryClient), staleTime: 0 })
    expect(me.caregiver.email).toBe("emily@example.test")
    expect(queryClient.getQueryData(queryKeys.today)).toBeUndefined()
    expect(queryClient.getQueryData(queryKeys.me)).toEqual(me)
  })

  it("refetches a screen's query for the new caregiver instead of leaving it on the last one's data", async () => {
    const queryClient = createQueryClient()
    const { api, signInAs } = signedInAs()
    await queryClient.fetchQuery(meQuery(api, queryClient))
    let todayFor = "andrew's today"
    const observer = new QueryObserver(queryClient, { queryKey: queryKeys.today, queryFn: async () => todayFor })
    const unsubscribe = observer.subscribe(() => undefined)
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("andrew's today"))
    signInAs("emily@example.test")
    todayFor = "emily's today"
    await queryClient.fetchQuery({ ...meQuery(api, queryClient), staleTime: 0 })
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("emily's today"))
    unsubscribe()
  })
})

describe("createQueryClient", () => {
  it("retries a 503 quietly and then loads", async () => {
    const queryClient = createQueryClient()
    let calls = 0
    const api = connectApi({
      baseUrl: "https://bt.example.test",
      report: () => undefined,
      fetch: async () => {
        calls += 1
        return calls < 3
          ? new Response('{"_tag":"ServiceUnavailable"}', { status: 503, headers: json })
          : new Response(meFor("andrew@example.test"), { headers: json })
      },
    })
    const me = await queryClient.fetchQuery({ ...meQuery(api, queryClient), retryDelay: 0 })
    expect(me.caregiver.email).toBe("andrew@example.test")
    expect(calls).toBe(3)
  })

  it("surfaces Offline instead of pausing when the phone reports no network", async () => {
    onlineManager.setOnline(false)
    try {
      const queryClient = createQueryClient()
      const api = connectApi({
        baseUrl: "https://bt.example.test",
        report: () => undefined,
        fetch: async () => {
          throw new TypeError("Failed to fetch")
        },
      })
      await expect(queryClient.fetchQuery(meQuery(api, queryClient))).rejects.toBeInstanceOf(Offline)
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it("keeps data fresh for 5 s, runs regardless of network state, and refetches on focus and reconnect", () => {
    expect(createQueryClient().getDefaultOptions().queries).toMatchObject({
      staleTime: 5_000,
      networkMode: "always",
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    })
  })
})

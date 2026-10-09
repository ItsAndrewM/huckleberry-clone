import { InvalidInput, queryKeys, ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"
import { meQuery } from "../src/api/me.ts"
import { createQueryClient, retryTransient } from "../src/api/query-client.ts"

const meFor = (email: string) =>
  JSON.stringify({
    caregiver: { id: email, email, displayName: email },
    household: { name: "Home", timeZone: "America/Vancouver" },
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
})

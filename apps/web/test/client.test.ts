import { ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import type { Signal } from "../src/api/connectivity.ts"
import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"

const ORIGIN = "https://bt.example.test"

const ME = {
  caregiver: { id: "caregiver-1", email: "andrew@example.test", displayName: "Andrew" },
  household: {
    name: "Home",
    timeZone: "America/Vancouver",
    units: { volume: "ml", weight: "kg", length: "cm" },
    version: 1,
    updatedBy: null,
    updatedAt: Date.UTC(2026, 9, 8),
    caregivers: [],
  },
  child: {
    name: "Robin",
    birthDate: "2026-09-01",
    sex: "female",
    gestationalAgeDays: 281,
    version: 1,
    updatedBy: null,
    updatedAt: Date.UTC(2026, 9, 8),
  },
}

const json = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "application/json" } })

const household = (answer: () => Promise<Response>) => {
  const signals: Signal[] = []
  const requests: Request[] = []
  const api = connectApi({
    baseUrl: ORIGIN,
    report: (signal) => signals.push(signal),
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return answer()
    },
  })
  return { api, signals, requests }
}

const getMe = (api: ReturnType<typeof connectApi>) => api.request((client) => client.me.me())

describe("connectApi", () => {
  it("asks for /api/me without following redirects or sending cookies cross-site, and decodes it", async () => {
    const { api, signals, requests } = household(async () => json(200, JSON.stringify(ME)))
    await expect(getMe(api)).resolves.toEqual(ME)
    expect(requests.map((request) => [request.method, request.url, request.redirect, request.credentials])).toEqual([
      ["GET", `${ORIGIN}/api/me`, "manual", "same-origin"],
    ])
    expect(signals).toEqual(["answered"])
  })

  it("reads Access's redirect to its sign-in page, an opaque redirect, as AuthRequired", async () => {
    const { api, signals } = household(async () => Response.error())
    await expect(getMe(api)).rejects.toBeInstanceOf(AuthRequired)
    expect(signals).toEqual(["signed-out"])
  })

  it("reads a fetch that never reached the network as Offline", async () => {
    const { api, signals } = household(() => Promise.reject(new TypeError("Load failed")))
    await expect(getMe(api)).rejects.toBeInstanceOf(Offline)
    expect(signals).toEqual(["unreachable"])
  })

  it("decodes the household's 401 as Unauthorized, which also means signing in again", async () => {
    const { api, signals } = household(async () => json(401, '{"_tag":"Unauthorized"}'))
    await expect(getMe(api)).rejects.toBeInstanceOf(Unauthorized)
    expect(signals).toEqual(["signed-out"])
  })

  it("reads a 503 as ServiceUnavailable: the Worker answered, so retry rather than sign in", async () => {
    const { api, signals } = household(async () => json(503, '{"_tag":"ServiceUnavailable"}'))
    await expect(getMe(api)).rejects.toBeInstanceOf(ServiceUnavailable)
    expect(signals).toEqual(["reached"])
  })

  it("keeps the status of any other answer it can't decode", async () => {
    const { api, signals } = household(async () => new Response("Internal Server Error", { status: 500 }))
    await expect(getMe(api)).rejects.toEqual(new Unexpected({ status: 500 }))
    expect(signals).toEqual(["reached"])
  })

  it("refuses a body that doesn't match the contract without changing what it knows about the network", async () => {
    const { api, signals } = household(async () => json(200, '{"caregiver":null}'))
    await expect(getMe(api)).rejects.toEqual(new Unexpected({ status: null }))
    expect(signals).toEqual([])
  })
})

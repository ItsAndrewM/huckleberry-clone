import { env } from "cloudflare:test"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Caller } from "../src/access.ts"
import { type Household, routeApi } from "../src/api.ts"
import type { HouseholdSeed } from "../src/seed.ts"
import { SEED } from "./fixtures.ts"

const ORIGIN = "https://bt.example.test"
const ADMIN_CLIENT_ID = "bt-admin.access"

const andrew: Caller = { kind: "user", email: "andrew@example.test" }
const adminToken: Caller = { kind: "service", clientId: ADMIN_CLIENT_ID }
const otherToken: Caller = { kind: "service", clientId: "bt-other.access" }

interface Recorded {
  readonly forwarded: Request[]
  readonly seeded: HouseholdSeed[]
}

const recordingHousehold = (alreadySeeded = false): Household & Recorded => {
  const forwarded: Request[] = []
  const seeded: HouseholdSeed[] = []
  return {
    forwarded,
    seeded,
    fetch: async (request) => {
      forwarded.push(request)
      return new Response("from the household")
    },
    seedHousehold: async (seed) => {
      seeded.push(seed)
      return { created: !alreadySeeded, household: seed }
    },
  }
}

const unreachableHousehold: Household = {
  fetch: () => Promise.reject(new Error("Durable Object reset because its code was updated.")),
  seedHousehold: () => Promise.reject(new Error("Network connection lost.")),
}

const routeWith =
  (adminClientId: string | undefined, alreadySeeded = false) =>
  async (path: string, caller: Caller, init: RequestInit = {}) => {
    const household = recordingHousehold(alreadySeeded)
    const response = await routeApi(new Request(`${ORIGIN}${path}`, init), caller, household, adminClientId)
    return { response, forwarded: household.forwarded, seeded: household.seeded }
  }

const route = routeWith(ADMIN_CLIENT_ID)

const loginPath = (returnTo: string) => `/api/login?${new URLSearchParams({ return: returnTo })}`

describe("a request nobody vouched for", () => {
  it.each(["/api/me", "/api/ws", "/api/login?return=/history", "/api/admin/caregiver/disable"])(
    "gets 401 Unauthorized for %s, and never reaches the household",
    async (path) => {
      const { response, forwarded } = await route(path, { kind: "unauthenticated" })
      expect(response.status).toBe(401)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toEqual({ _tag: "Unauthorized" })
      expect(forwarded).toEqual([])
    },
  )

  it.each(["/api/me", "/api/login?return=/history"])(
    "gets 503 ServiceUnavailable for %s while Cloudflare's keys are out of reach, so the app retries",
    async (path) => {
      const { response, forwarded } = await route(path, { kind: "keys-unavailable" })
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ _tag: "ServiceUnavailable" })
      expect(forwarded).toEqual([])
    },
  )
})

describe("a signed-in user", () => {
  it("is sent through to the household, which answers", async () => {
    const { response, forwarded } = await route("/api/me", andrew)
    expect(await response.text()).toBe("from the household")
    expect(forwarded.map((request) => request.headers.get("x-bt-email"))).toEqual(["andrew@example.test"])
  })

  it("can't speak for anyone else: every client-sent x-bt-* header is dropped, whatever its case", async () => {
    const headers = new Headers({ "X-BT-Email": "emily@example.test", "x-bt-caregiver": "cg-emily", "X-Bt-Other": "1" })
    headers.append("x-bt-email", "intruder@example.test")
    const { forwarded } = await route("/api/me", andrew, { headers })
    const internal = forwarded.flatMap((request) => [...request.headers].filter(([name]) => name.startsWith("x-bt-")))
    expect(internal).toEqual([["x-bt-email", "andrew@example.test"]])
  })

  it("keeps the method, body and other headers of what it sends", async () => {
    const { forwarded } = await route("/api/diapers", andrew, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId: "a1", wet: true }),
    })
    const [request] = forwarded
    expect(request?.method).toBe("POST")
    expect(request?.headers.get("content-type")).toBe("application/json")
    expect(await request?.json()).toEqual({ actionId: "a1", wet: true })
  })

  it("is refused on /api/admin/*", async () => {
    const { response, forwarded } = await route("/api/admin/caregiver/disable", andrew, { method: "POST" })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
    expect(forwarded).toEqual([])
  })
})

describe("a service token", () => {
  it("is refused on caregiver routes, even the admin's", async () => {
    const { response, forwarded } = await route("/api/me", adminToken)
    expect(response.status).toBe(401)
    expect(forwarded).toEqual([])
  })

  it("is refused on /api/admin/* unless it is the admin's", async () => {
    const { response } = await route("/api/admin/caregiver/disable", otherToken)
    expect(response.status).toBe(401)
  })

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("is refused on /api/admin/* while the admin Client ID is %s", async (_label, adminClientId) => {
    const { response } = await routeWith(adminClientId)("/api/admin/caregiver/disable", adminToken)
    expect(response.status).toBe(401)
  })

  it("gets past the admin gate as the admin, to a 404 on paths with no admin route", async () => {
    const { response, forwarded } = await route("/api/admin/caregiver/disable", adminToken, { method: "POST" })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ _tag: "NotFound" })
    expect(forwarded).toEqual([])
  })
})

describe("seeding the household (POST /api/admin/household)", () => {
  const seedRequest = (body: string): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })

  it("seeds it as the admin, and answers 201 with what was stored", async () => {
    const { response, seeded, forwarded } = await route(
      "/api/admin/household",
      adminToken,
      seedRequest(JSON.stringify(SEED)),
    )
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ created: true, household: SEED })
    expect(seeded).toEqual([SEED])
    expect(forwarded).toEqual([])
  })

  it("answers 200 when the household was already seeded, which leaves it as it was", async () => {
    const seededBefore = routeWith(ADMIN_CLIENT_ID, true)
    const { response } = await seededBefore("/api/admin/household", adminToken, seedRequest(JSON.stringify(SEED)))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ created: false })
  })

  it("refuses a seed with bad fields with 400, naming each one, and seeds nothing", async () => {
    const bad = {
      ...SEED,
      timeZone: "Mars/Olympus_Mons",
      caregivers: [
        { email: "andrew@example.test", displayName: "Andrew" },
        { email: "Emily@Example.test", displayName: "" },
      ],
      child: { ...SEED.child, gestationalAgeDays: 40 },
    }
    const { response, seeded } = await route("/api/admin/household", adminToken, seedRequest(JSON.stringify(bad)))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      _tag: "InvalidInput",
      fieldErrors: [
        { path: "timeZone", issue: "invalid" },
        { path: "caregivers.1.email", issue: "invalid" },
        { path: "caregivers.1.displayName", issue: "invalid" },
        { path: "child.gestationalAgeDays", issue: "invalid" },
      ],
    })
    expect(seeded).toEqual([])
  })

  it("refuses two caregivers with one email", async () => {
    const twice = { ...SEED, caregivers: [...SEED.caregivers, ...SEED.caregivers] }
    const { response } = await route("/api/admin/household", adminToken, seedRequest(JSON.stringify(twice)))
    expect(await response.json()).toEqual({
      _tag: "InvalidInput",
      fieldErrors: [{ path: "caregivers", issue: "invalid" }],
    })
  })

  it("refuses a body that isn't JSON with 400", async () => {
    const { response } = await route("/api/admin/household", adminToken, seedRequest("{"))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ _tag: "InvalidInput", fieldErrors: [{ path: "", issue: "invalid" }] })
  })

  it("answers 404 to any other method", async () => {
    const { response, seeded } = await route("/api/admin/household", adminToken)
    expect(response.status).toBe(404)
    expect(seeded).toEqual([])
  })

  it("is refused to a caregiver, before the body is read", async () => {
    const { response, seeded } = await route("/api/admin/household", andrew, seedRequest(JSON.stringify(SEED)))
    expect(response.status).toBe(401)
    expect(seeded).toEqual([])
  })
})

describe("a household that can't be reached", () => {
  const routeToNowhere = (path: string, caller: Caller, init: RequestInit = {}) =>
    routeApi(new Request(`${ORIGIN}${path}`, init), caller, unreachableHousehold, ADMIN_CLIENT_ID)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ["a caregiver's request", "/api/me", andrew, {}, "Durable Object reset because its code was updated."],
    [
      "the admin's seed",
      "/api/admin/household",
      adminToken,
      { method: "POST", body: JSON.stringify(SEED) },
      "Network connection lost.",
    ],
  ])(
    "logs why %s failed, and answers 503 ServiceUnavailable, which the app retries",
    async (_label, path, caller, init, cause) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
      const response = await routeToNowhere(path, caller, init)
      expect(consoleError).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith(new Error(cause))
      expect(response.status).toBe(503)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toEqual({ _tag: "ServiceUnavailable" })
    },
  )
})

describe("/api/login", () => {
  it.each([
    ["/history", `${ORIGIN}/history`],
    ["/history?view=week#today", `${ORIGIN}/history?view=week#today`],
    ["/.//evil.test", `${ORIGIN}//evil.test`],
  ])("sends a signed-in caller back to %s on this origin", async (returnTo, location) => {
    const { response, forwarded } = await route(loginPath(returnTo), andrew)
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(location)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(forwarded).toEqual([])
  })

  it.each([
    "https://evil.test/",
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test",
    "/\n/evil.test",
    "//",
    "history",
    "javascript:alert(1)",
    "",
  ])("sends the caller home instead of to %j", async (returnTo) => {
    const { response } = await route(loginPath(returnTo), andrew)
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`)
  })

  it("sends the caller home when there is no return path", async () => {
    const { response } = await route("/api/login", adminToken)
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`)
  })
})

describe("/api/admin spelled so the gate's prefix check misses it", () => {
  it.each(["/api/admin", "/api/%61dmin/household", "/api/admin%2Fhousehold"])(
    "reaches the household as the caregiver, which has no admin routes, so %s seeds nothing",
    async (path) => {
      const household = env.HOUSEHOLD.getByName(crypto.randomUUID())
      const request = new Request(`${ORIGIN}${path}`, { method: "POST", body: JSON.stringify(SEED) })
      const response = await routeApi(request, andrew, household, ADMIN_CLIENT_ID)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ _tag: "NotFound" })
      expect(await household.seedHousehold(SEED)).toMatchObject({ created: true })
    },
  )
})

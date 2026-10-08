import { describe, expect, it } from "vitest"
import type { Caller } from "../src/access.ts"
import { routeApi } from "../src/api.ts"

const ORIGIN = "https://bt.example.test"
const ADMIN_CLIENT_ID = "bt-admin.access"

const andrew: Caller = { kind: "user", email: "andrew@example.test" }
const adminToken: Caller = { kind: "service", clientId: ADMIN_CLIENT_ID }
const otherToken: Caller = { kind: "service", clientId: "bt-other.access" }

const routeWith =
  (adminClientId: string | undefined) =>
  async (path: string, caller: Caller, init: RequestInit = {}) => {
    const forwarded: Request[] = []
    const household = async (request: Request) => {
      forwarded.push(request)
      return new Response("from the household")
    }
    const response = await routeApi(new Request(`${ORIGIN}${path}`, init), caller, household, adminClientId)
    return { response, forwarded }
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

  it("gets past the admin gate as the admin, to a 404 until M1.5 adds admin routes", async () => {
    const { response, forwarded } = await route("/api/admin/caregiver/disable", adminToken, { method: "POST" })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ _tag: "NotFound" })
    expect(forwarded).toEqual([])
  })
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

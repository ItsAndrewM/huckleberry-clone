import { SELF } from "cloudflare:test"
import { afterEach, describe, expect, it, vi } from "vitest"

const ORIGIN = "https://bt.example.test"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the Worker entry, as deployed from M1.16", () => {
  it("runs inside workerd, not Node", () => {
    expect(navigator.userAgent).toBe("Cloudflare-Workers")
  })

  it("refuses /api/* when nothing vouches for the caller, since the test pool ignores access.dev", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const response = await SELF.fetch(`${ORIGIN}/api/me`)
    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith({ event: "refused", reason: "no-token", route: "GET /api/me" })
  })

  it("refuses a forged Access JWT under the production Access settings", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const forged = ["e30", btoa(JSON.stringify({ email: "andrew@example.test" })), "c2ln"].join(".")
    const response = await SELF.fetch(`${ORIGIN}/api/me`, { headers: { "cf-access-jwt-assertion": forged } })
    expect(response.status).toBe(401)
    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith({ event: "refused", reason: "malformed", route: "GET /api/me" })
  })

  it("leaves non-API paths to Static Assets", async () => {
    expect((await SELF.fetch(`${ORIGIN}/history`)).status).toBe(404)
  })
})

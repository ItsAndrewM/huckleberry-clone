import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"

const ORIGIN = "https://bt.example.test"

describe("the Worker entry, as deployed until M1.16", () => {
  it("runs inside workerd, not Node", () => {
    expect(navigator.userAgent).toBe("Cloudflare-Workers")
  })

  it("refuses /api/* when nothing vouches for the caller, since the test pool ignores access.dev", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/me`)
    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })

  it("refuses an Access JWT while ACCESS_AUD is empty", async () => {
    const forged = ["e30", btoa(JSON.stringify({ email: "andrew@example.test" })), "c2ln"].join(".")
    const response = await SELF.fetch(`${ORIGIN}/api/me`, { headers: { "cf-access-jwt-assertion": forged } })
    expect(response.status).toBe(401)
  })

  it("leaves non-API paths to Static Assets", async () => {
    expect((await SELF.fetch(`${ORIGIN}/history`)).status).toBe(404)
  })
})

import { describe, expect, it } from "vitest"
import { caregiverFromArgs } from "./admin-caregiver.ts"
import { adminRequest } from "./admin-seed.ts"

const ENV = {
  BT_URL: "https://bt.example.test",
  CF_ACCESS_CLIENT_ID: "bt-admin.access",
  CF_ACCESS_CLIENT_SECRET: "not-a-real-secret",
}

describe("pnpm admin caregiver:disable and caregiver:enable", () => {
  it("take one email, trimmed and lowercased as the seed stored it", () => {
    expect(caregiverFromArgs([" Emily@Example.test "])).toEqual({ email: "emily@example.test" })
  })

  it.each([
    ["no email", []],
    ["a blank email", [" "]],
    ["two emails", ["andrew@example.test", "emily@example.test"]],
  ])("stop at %s", (_label, args) => {
    expect(() => caregiverFromArgs(args)).toThrow("Give one caregiver email")
  })

  it("stop at a flag they don't know", () => {
    expect(() => caregiverFromArgs(["--all"])).toThrow("Unknown option '--all'")
  })

  it("post the email to the admin route with the service token", async () => {
    const request = adminRequest(ENV, "/api/admin/caregiver/disable", caregiverFromArgs(["emily@example.test"]))
    expect(request.method).toBe("POST")
    expect(request.url).toBe("https://bt.example.test/api/admin/caregiver/disable")
    expect(request.redirect).toBe("manual")
    expect(request.headers.get("cf-access-client-id")).toBe("bt-admin.access")
    expect(await request.json()).toEqual({ email: "emily@example.test" })
  })
})

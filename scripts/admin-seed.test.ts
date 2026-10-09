import { describe, expect, it } from "vitest"
import { adminRequest, seedFromArgs } from "./admin-seed.ts"

const ARGS = [
  "--name",
  "Our household",
  "--time-zone",
  "America/Vancouver",
  "--caregiver",
  "Andrew@Example.test=Andrew",
  "--caregiver",
  "emily@example.test = Emily M",
  "--child-name",
  "Robin",
  "--birth-date",
  "2026-09-01",
  "--sex",
  "female",
  "--gestational-age-days",
  "281",
]

const SEED = {
  name: "Our household",
  timeZone: "America/Vancouver",
  caregivers: [
    { email: "andrew@example.test", displayName: "Andrew" },
    { email: "emily@example.test", displayName: "Emily M" },
  ],
  child: { name: "Robin", birthDate: "2026-09-01", sex: "female" as const, gestationalAgeDays: 281 },
}

const ENV = {
  BT_URL: "https://bt.example.test",
  CF_ACCESS_CLIENT_ID: "bt-admin.access",
  CF_ACCESS_CLIENT_SECRET: "not-a-real-secret",
}

describe("pnpm admin household:seed", () => {
  it("turns its flags into the seed, with each caregiver's email lowercased", () => {
    expect(seedFromArgs(ARGS)).toEqual(SEED)
  })

  it.each([
    ["a sex the WHO tables don't cover", ["--sex", "unknown"], '--sex must be female or male, not "unknown"'],
    [
      "a caregiver without a display name",
      ["--caregiver", "andrew@example.test"],
      "--caregiver takes email=Display Name",
    ],
    ["a flag it doesn't know", ["--nmae", "Typo"], "Unknown option '--nmae'"],
  ])("stops at %s", (_label, extra, message) => {
    expect(() => seedFromArgs([...ARGS, ...extra])).toThrow(message)
  })

  it("stops when a flag is missing", () => {
    expect(() => seedFromArgs(ARGS.slice(2))).toThrow("Missing --name")
  })

  it("posts it to the admin route with the service token, and won't follow Access to its login page", async () => {
    const request = adminRequest(ENV, "/api/admin/household", SEED)
    expect(request.method).toBe("POST")
    expect(request.url).toBe("https://bt.example.test/api/admin/household")
    expect(request.redirect).toBe("manual")
    expect(request.headers.get("cf-access-client-id")).toBe("bt-admin.access")
    expect(request.headers.get("cf-access-client-secret")).toBe("not-a-real-secret")
    expect(await request.json()).toEqual(SEED)
  })

  it.each(["BT_URL", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"] as const)(
    "stops when %s is missing from .admin-token.env",
    (name) => {
      expect(() => adminRequest({ ...ENV, [name]: undefined }, "/api/admin/household", SEED)).toThrow(
        `Set ${name} in .admin-token.env`,
      )
    },
  )
})

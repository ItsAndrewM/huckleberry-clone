import { describe, expect, it } from "vitest"
import { restoreFromArgs } from "./admin-pitr.ts"
import { adminRequest } from "./admin-seed.ts"

const ENV = {
  BT_URL: "https://bt.example.test",
  CF_ACCESS_CLIENT_ID: "bt-admin.access",
  CF_ACCESS_CLIENT_SECRET: "not-a-real-secret",
}

const BOOKMARK = "0000007b-0000b26e-00001538-0c3e87bb37b3db5cc52eedb93cd3b96b"

describe("pnpm admin pitr:bookmark", () => {
  it("posts an empty body to the admin route with the service token", async () => {
    const request = adminRequest(ENV, "/api/admin/pitr/bookmark")
    expect(request.method).toBe("POST")
    expect(request.url).toBe("https://bt.example.test/api/admin/pitr/bookmark")
    expect(request.headers.get("cf-access-client-secret")).toBe("not-a-real-secret")
    expect(await request.json()).toEqual({})
  })
})

describe("pnpm admin pitr:restore", () => {
  it("takes one bookmark", () => {
    expect(restoreFromArgs([BOOKMARK])).toEqual({ bookmark: BOOKMARK })
  })

  it.each([
    ["UTC", "2026-10-10T18:00:00Z", Date.UTC(2026, 9, 10, 18)],
    ["an offset", "2026-10-10T11:00:00-07:00", Date.UTC(2026, 9, 10, 18)],
  ])("takes --at as an ISO time in %s", (_label, text, at) => {
    expect(restoreFromArgs(["--at", text])).toEqual({ at })
  })

  it.each([
    ["a time with no zone, which would be read in this Mac's", "2026-10-10T18:00:00"],
    ["something that isn't a time", "yesterdayZ"],
  ])("refuses --at with %s", (_label, text) => {
    expect(() => restoreFromArgs(["--at", text])).toThrow("--at takes an ISO time with its zone")
  })

  it.each([
    ["nothing", []],
    ["two bookmarks", [BOOKMARK, BOOKMARK]],
    ["a bookmark and --at", [BOOKMARK, "--at", "2026-10-10T18:00:00Z"]],
  ])("stops at %s", (_label, args) => {
    expect(() => restoreFromArgs(args)).toThrow("Give one bookmark, or --at <ISO time>")
  })

  it("posts the target to the admin route", async () => {
    const request = adminRequest(ENV, "/api/admin/pitr/restore", restoreFromArgs([BOOKMARK]))
    expect(request.url).toBe("https://bt.example.test/api/admin/pitr/restore")
    expect(await request.json()).toEqual({ bookmark: BOOKMARK })
  })
})

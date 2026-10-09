import { describe, expect, it } from "vitest"
import { signInUrl } from "../src/shell/sign-in.ts"

describe("signInUrl", () => {
  it("sends the parent through /api/login and back to the page they were on, query included", () => {
    expect(signInUrl({ pathname: "/history", search: "" })).toBe("/api/login?return=%2Fhistory")
    expect(signInUrl({ pathname: "/history", search: "?week=2026-W41" })).toBe(
      "/api/login?return=%2Fhistory%3Fweek%3D2026-W41",
    )
  })
})

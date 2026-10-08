import { describe, expect, it } from "vitest"

describe("domain test harness", () => {
  it("runs in a host time zone that is not UTC, so code that reads the host zone fails here", () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Australia/Lord_Howe")
  })
})

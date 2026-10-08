import { describe, expect, inject, it } from "vitest"

declare module "vitest" {
  export interface ProvidedContext {
    hostZone: string
  }
}

describe("domain test harness", () => {
  it("runs in the host time zone its project sets, never UTC", () => {
    const hostZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(hostZone).toBe(inject("hostZone"))
    expect(hostZone).not.toBe("UTC")
  })
})

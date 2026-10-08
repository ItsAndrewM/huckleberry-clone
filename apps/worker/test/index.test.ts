import { describe, expect, it } from "vitest"
import worker from "../src/index.ts"

const call = (path: string) =>
  worker.fetch(new Request(`https://bt.example.test${path}`) as Request<unknown, IncomingRequestCfProperties>)

describe("worker entry until M1.4 adds Access", () => {
  it("runs inside workerd, not Node", () => {
    expect(navigator.userAgent).toBe("Cloudflare-Workers")
  })

  it.each(["/api/me", "/api/today", "/api/ws", "/api/admin/caregiver/disable"])("denies %s with 401", async (path) => {
    const res = call(path)
    expect(res.status).toBe(401)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual({ _tag: "Unauthorized" })
  })

  it("leaves non-API paths to Static Assets", () => {
    expect(call("/history").status).toBe(404)
  })
})

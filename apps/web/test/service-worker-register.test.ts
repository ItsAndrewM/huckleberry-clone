import { describe, expect, it } from "vitest"
import { registerServiceWorker, SERVICE_WORKER_URL } from "../src/service-worker/register.ts"

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole app", async () => {
    const calls: Array<[string, RegistrationOptions]> = []
    const registrar = {
      register: (url: string, options: RegistrationOptions) => {
        calls.push([url, options])
        return Promise.resolve({ scope: "/" })
      },
    }
    expect(await registerServiceWorker(registrar)).toBe("registered")
    expect(SERVICE_WORKER_URL).toBe("/sw.js")
    expect(calls).toEqual([["/sw.js", { scope: "/" }]])
  })

  it("lets the app run without its saved copy when the browser refuses the worker", async () => {
    const registrar = { register: () => Promise.reject(new DOMException("blocked", "SecurityError")) }
    expect(await registerServiceWorker(registrar)).toBe("unavailable")
  })
})

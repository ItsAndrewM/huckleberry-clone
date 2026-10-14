import { describe, expect, it } from "vitest"
import { type UpdateSource, watchUpdates } from "../src/service-worker/updates.ts"

type Registration = NonNullable<Awaited<ReturnType<UpdateSource["getRegistration"]>>>

const workerSource = (registration: () => Promise<Registration | undefined>) => {
  const listened: Array<string> = []
  const listeners: Array<() => void> = []
  return {
    listened,
    takeOver: () => {
      for (const listener of listeners) listener()
    },
    getRegistration: registration,
    addEventListener: (type: "controllerchange", listener: () => void) => {
      listened.push(type)
      listeners.push(listener)
    },
  }
}

const updating = () => {
  const asked: Array<"update"> = []
  const registration: Registration = {
    update: () => {
      asked.push("update")
      return Promise.resolve({ scope: "/" })
    },
  }
  return { asked, registration }
}

describe("watchUpdates", () => {
  it("asks the service worker to look for a new version", async () => {
    const { asked, registration } = updating()
    const updates = watchUpdates(workerSource(() => Promise.resolve(registration)))
    expect(await updates.check()).toBe("checked")
    expect(asked).toEqual(["update"])
  })

  it("says the check was unavailable without a service worker, a registration, or a network that answers", async () => {
    const refused: Registration = { update: () => Promise.reject(new TypeError("Failed to fetch")) }
    expect(await watchUpdates(undefined).check()).toBe("unavailable")
    expect(await watchUpdates(workerSource(() => Promise.resolve(undefined))).check()).toBe("unavailable")
    expect(await watchUpdates(workerSource(() => Promise.reject(new DOMException("blocked")))).check()).toBe(
      "unavailable",
    )
    expect(await watchUpdates(workerSource(() => Promise.resolve(refused))).check()).toBe("unavailable")
  })

  it("counts each time another service worker takes over the page, and tells whoever listens until they stop", () => {
    const source = workerSource(() => Promise.resolve(undefined))
    const updates = watchUpdates(source)
    const heard: Array<number> = []
    const stop = updates.subscribe(() => heard.push(updates.changes()))
    expect(source.listened).toEqual(["controllerchange"])
    expect(updates.changes()).toBe(0)
    source.takeOver()
    stop()
    source.takeOver()
    expect(heard).toEqual([1])
    expect(updates.changes()).toBe(2)
  })
})

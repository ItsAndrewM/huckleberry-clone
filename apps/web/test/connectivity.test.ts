import { describe, expect, it } from "vitest"
import { type Connectivity, createConnectivity, followBrowser, type Signal } from "../src/api/connectivity.ts"

const after = (online: boolean, signals: ReadonlyArray<Signal>): Connectivity => {
  const store = createConnectivity(online)
  for (const signal of signals) store.report(signal)
  return store.current()
}

describe("createConnectivity", () => {
  it("starts from what the browser says about the network", () => {
    expect(after(true, [])).toBe("online")
    expect(after(false, [])).toBe("offline")
  })

  it.each<[ReadonlyArray<Signal>, Connectivity]>([
    [["unreachable"], "offline"],
    [["unreachable", "reached"], "online"],
    [["signed-out"], "auth-required"],
    [["signed-out", "reached"], "online"],
    [["offline"], "offline"],
    [["offline", "online"], "online"],
    [["signed-out", "online"], "auth-required"],
  ])("after %j it is %s", (signals, expected) => {
    expect(after(true, signals)).toBe(expected)
  })

  it("shows No connection over Sign in while offline, then asks to sign in again once back online", () => {
    expect(after(true, ["signed-out", "offline"])).toBe("offline")
    expect(after(true, ["signed-out", "offline", "online"])).toBe("auth-required")
    expect(after(true, ["signed-out", "unreachable", "online"])).toBe("auth-required")
  })

  it("tells its listeners only when what it shows changes, and stops once they unsubscribe", () => {
    const store = createConnectivity(true)
    const heard: Connectivity[] = []
    const unsubscribe = store.subscribe(() => heard.push(store.current()))
    store.report("reached")
    store.report("unreachable")
    store.report("unreachable")
    store.report("signed-out")
    unsubscribe()
    store.report("reached")
    expect(heard).toEqual(["offline", "auth-required"])
  })
})

describe("followBrowser", () => {
  it("reports the browser's online and offline events", () => {
    const store = createConnectivity(true)
    const browser = new EventTarget()
    followBrowser(store, browser)
    browser.dispatchEvent(new Event("offline"))
    expect(store.current()).toBe("offline")
    browser.dispatchEvent(new Event("online"))
    expect(store.current()).toBe("online")
  })
})

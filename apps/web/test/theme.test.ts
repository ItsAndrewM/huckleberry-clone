import { describe, expect, it } from "vitest"
import { applyTheme, storedTheme, THEME_KEY } from "../src/theme/theme.ts"

const storage = (initial: string | null = null) => {
  const values = new Map<string, string>()
  if (initial !== null) values.set(THEME_KEY, initial)
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

const blockedStorage = (): never => {
  throw new DOMException("The operation is insecure.", "SecurityError")
}

const failingStorage = () => ({ getItem: blockedStorage, setItem: blockedStorage, removeItem: blockedStorage })

const unavailable = [
  ["blocks storage", blockedStorage],
  ["can't read or write it", failingStorage],
] as const

describe("storedTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    [null, "system"],
    ["sepia", "system"],
  ])("reads %s as %s", (stored, theme) => {
    expect(storedTheme(() => storage(stored))).toBe(theme)
  })

  it.each(unavailable)("reads System when the browser %s", (_, openStorage) => {
    expect(storedTheme(openStorage)).toBe("system")
  })
})

describe("applyTheme", () => {
  it("stores a chosen theme under the key index.html reads before the first paint, and marks the page", () => {
    const store = storage()
    const root = { dataset: {} }
    applyTheme("dark", () => store, root)
    expect(THEME_KEY).toBe("bt.theme")
    expect([store.values.get(THEME_KEY), root.dataset]).toEqual(["dark", { theme: "dark" }])
  })

  it("forgets the choice for System, so the page follows the phone again", () => {
    const store = storage("light")
    const root = { dataset: { theme: "light" } }
    applyTheme("system", () => store, root)
    expect([store.values.has(THEME_KEY), root.dataset]).toEqual([false, {}])
  })

  it.each(unavailable)("still marks the page with a chosen theme when the browser %s", (_, openStorage) => {
    const root = { dataset: {} }
    applyTheme("dark", openStorage, root)
    expect(root.dataset).toEqual({ theme: "dark" })
  })

  it.each(unavailable)("still lets the page follow the phone after System when the browser %s", (_, openStorage) => {
    const root = { dataset: { theme: "dark" } }
    applyTheme("system", openStorage, root)
    expect(root.dataset).toEqual({})
  })
})

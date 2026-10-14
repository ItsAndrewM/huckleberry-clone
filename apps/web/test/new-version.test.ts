import { describe, expect, it } from "vitest"
import type { Checked } from "../src/service-worker/updates.ts"
import { isIdle, type Return, returnToApp } from "../src/shell/new-version.ts"
import { DIAPER, DIAPER_HELD } from "./held-fixtures.ts"
import { NOW } from "./today-fixtures.ts"

const QUIET = { open: null, busy: null, held: [], toast: null }
const ELEMENT = { matches: () => true }

const page = (opened: string | null, focused: string | null) => ({
  querySelector: (selectors: string) => (opened !== null && selectors.includes(opened) ? ELEMENT : null),
  activeElement: focused === null ? null : { matches: (selectors: string) => selectors.includes(focused) },
})

describe("isIdle", () => {
  it("is idle with nothing open, nothing being sent or kept, no Undo on screen and nothing being typed", () => {
    expect(isIdle(QUIET, page(null, null))).toBe(true)
    expect(isIdle(QUIET, page(null, "button"))).toBe(true)
  })

  it.each([
    ["a sheet is open", { ...QUIET, open: "diaper" as const }],
    ["an entry is on its way", { ...QUIET, busy: DIAPER }],
    ["an entry is kept on the phone", { ...QUIET, held: [DIAPER_HELD] }],
    ["Undo is on screen", { ...QUIET, toast: { message: "Saved", undo: DIAPER, until: NOW } }],
  ])("isn't idle while %s", (_case, sheets) => {
    expect(isIdle(sheets, page(null, null))).toBe(false)
  })

  it.each([
    ["a dialog", '[role="dialog"]', null],
    ["a confirmation", '[role="alertdialog"]', null],
    ["a text field has focus", null, "input"],
    ["a text area has focus", null, "textarea"],
    ["a picker has focus", null, "select"],
  ])("isn't idle while %s is open", (_case, opened, focused) => {
    expect(isIdle(QUIET, page(opened, focused))).toBe(false)
  })
})

const steps = (idle: ReadonlyArray<boolean>, newer: boolean) => {
  const done: Array<string> = []
  const answers = [...idle]
  const step: Return = {
    idle: () => answers.shift() ?? false,
    newerSaved: () => {
      done.push("looked")
      return Promise.resolve(newer)
    },
    reload: () => {
      done.push("reloaded")
    },
    check: (): Promise<Checked> => {
      done.push("checked")
      return Promise.resolve("checked")
    },
  }
  return { done, step }
}

describe("returnToApp", () => {
  it("opens a newer saved version when the app comes back idle", async () => {
    const { done, step } = steps([true, true], true)
    expect(await returnToApp(step)).toBe("reloaded")
    expect(done).toEqual(["looked", "reloaded"])
  })

  it("only checks for a new version when the app comes back busy, so nothing open is cut off", async () => {
    const { done, step } = steps([false], true)
    expect(await returnToApp(step)).toBe("checked")
    expect(done).toEqual(["checked"])
  })

  it("checks for a new version when none is saved yet", async () => {
    const { done, step } = steps([true], false)
    expect(await returnToApp(step)).toBe("checked")
    expect(done).toEqual(["looked", "checked"])
  })

  it("waits for the next return when something opens while it looks for the saved version", async () => {
    const { done, step } = steps([true, false], true)
    expect(await returnToApp(step)).toBe("waiting")
    expect(done).toEqual(["looked"])
  })
})

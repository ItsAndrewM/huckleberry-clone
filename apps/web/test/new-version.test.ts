import { describe, expect, it } from "vitest"
import type { Checked } from "../src/service-worker/updates.ts"
import { isIdle, type Return, returnToApp } from "../src/shell/new-version.ts"
import { DIAPER, DIAPER_HELD } from "./held-fixtures.ts"
import { NOW } from "./today-fixtures.ts"

const QUIET = { open: null, held: [], toast: null }
const ELEMENT = { matches: () => true }

const page = (opened: string | null, focused: string | null) => ({
  querySelector: (selectors: string) => (opened !== null && selectors.includes(opened) ? ELEMENT : null),
  activeElement: focused === null ? null : { matches: (selectors: string) => selectors.includes(focused) },
})

describe("isIdle", () => {
  it("is idle with nothing open, nothing being saved or kept, no Undo on screen and nothing being typed", () => {
    expect(isIdle(QUIET, page(null, null), 0)).toBe(true)
    expect(isIdle(QUIET, page(null, "button"), 0)).toBe(true)
  })

  it.each([
    ["a sheet is open", { ...QUIET, open: "diaper" as const }],
    ["an entry is kept on the phone", { ...QUIET, held: [DIAPER_HELD] }],
    ["Undo is on screen", { ...QUIET, toast: { message: "Saved", undo: DIAPER, until: NOW } }],
  ])("isn't idle while %s", (_case, sheets) => {
    expect(isIdle(sheets, page(null, null), 0)).toBe(false)
  })

  it("isn't idle while anything is on its way to the household, an entry or a Settings change", () => {
    expect(isIdle(QUIET, page(null, null), 1)).toBe(false)
  })

  it.each([
    ["a dialog is open", '[role="dialog"]', null],
    ["a confirmation is open", '[role="alertdialog"]', null],
    ["a form holds a change that isn't saved", "[data-unsaved]", null],
    ["a text field has focus", null, "input"],
    ["a text area has focus", null, "textarea"],
    ["a picker has focus", null, "select"],
  ])("isn't idle while %s", (_case, opened, focused) => {
    expect(isIdle(QUIET, page(opened, focused), 0)).toBe(false)
  })
})

const steps = (idle: ReadonlyArray<boolean>, online: ReadonlyArray<boolean>, checked: Checked, newer: boolean) => {
  const done: Array<string> = []
  const idleAnswers = [...idle]
  const onlineAnswers = [...online]
  const step: Return = {
    idle: () => idleAnswers.shift() ?? false,
    online: () => onlineAnswers.shift() ?? false,
    newerSaved: () => {
      done.push("looked")
      return Promise.resolve(newer)
    },
    reload: () => {
      done.push("reloaded")
    },
    check: () => {
      done.push("checked")
      return Promise.resolve(checked)
    },
  }
  return { done, step }
}

describe("returnToApp", () => {
  it("opens a newer saved version when the app comes back idle, once its check has reached the household", async () => {
    const { done, step } = steps([true, true], [true, true], "checked", true)
    expect(await returnToApp(step)).toBe("reloaded")
    expect(done).toEqual(["checked", "looked", "reloaded"])
  })

  it("keeps the page it has when the check can't reach the household, so Today and logging stay offline", async () => {
    const { done, step } = steps([true, true], [true, true], "unavailable", true)
    expect(await returnToApp(step)).toBe("unavailable")
    expect(done).toEqual(["checked"])
  })

  it("keeps the page it has when the phone says it's offline, whatever the check answered", async () => {
    const { done, step } = steps([true, true], [false, false], "checked", true)
    expect(await returnToApp(step)).toBe("checked")
    expect(done).toEqual(["checked"])
  })

  it("only checks for a new version when the app comes back busy, so nothing open is cut off", async () => {
    const { done, step } = steps([false], [true], "checked", true)
    expect(await returnToApp(step)).toBe("checked")
    expect(done).toEqual(["checked"])
  })

  it("checks for a new version, and keeps the page, when none is saved yet", async () => {
    const { done, step } = steps([true], [true], "checked", false)
    expect(await returnToApp(step)).toBe("checked")
    expect(done).toEqual(["checked", "looked"])
  })

  it.each([
    ["something opens", [true, false], [true, true]],
    ["the connection drops", [true, true], [true, false]],
  ])("waits for the next return when %s while it checks and looks", async (_case, idle, online) => {
    const { done, step } = steps(idle, online, "checked", true)
    expect(await returnToApp(step)).toBe("waiting")
    expect(done).toEqual(["checked", "looked"])
  })
})

import type { Locator, Page } from "@playwright/test"
import { playEveryScreen } from "./played-screens.ts"
import { STILL } from "./still.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const FULL_RING = "0 0 0 3px var(--destructive)"

const ringOf = (field: Locator) =>
  field.evaluate((element, fullRing) => {
    const owner = element.ownerDocument
    const view = owner.defaultView
    const reference = owner.createElement("span")
    reference.style.boxShadow = fullRing
    owner.body.append(reference)
    const full = view?.getComputedStyle(reference).boxShadow ?? ""
    reference.remove()
    const shadow = view?.getComputedStyle(element).boxShadow ?? ""
    return { shadow, full, focusVisible: element.matches(":focus-visible") }
  }, FULL_RING)

const expectFullRingOnceTabbedTo = async (page: Page, field: Locator, from: Locator, key: "Tab" | "Shift+Tab") => {
  await page.addStyleTag({ content: STILL })
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme })
    await from.focus()
    const resting = await ringOf(field)
    expect(resting.shadow).not.toContain(resting.full)
    await page.keyboard.press(key)
    await expect(field).toBeFocused()
    const focused = await ringOf(field)
    expect(focused.focusVisible).toBe(true)
    expect(focused.shadow).not.toBe(resting.shadow)
    expect(focused.shadow).toContain(focused.full)
  }
}

const markInvalid = (control: Locator) => control.evaluate((element) => element.setAttribute("aria-invalid", "true"))

const openMeasurementSheet = async (page: Page) => {
  await playEveryScreen(page)
  await page.goto("/growth")
  await page.getByRole("button", { name: "Add measurement" }).first().click()
  const sheet = page.getByRole("dialog", { name: "Add measurement" })
  await expect(sheet).toBeVisible()
  return {
    change: sheet.getByRole("button", { name: "Change, When" }),
    weight: sheet.getByRole("textbox", { name: "Weight" }),
    unit: sheet.getByRole("combobox", { name: "Weight unit" }),
  }
}

test("a keyboard-focused number that won't read is ringed at full strength", async ({ page }) => {
  const { change, weight } = await openMeasurementSheet(page)
  await weight.fill("abc")
  await expect(weight).toHaveAttribute("aria-invalid", "true")
  await expectFullRingOnceTabbedTo(page, weight, change, "Tab")
})

test("a keyboard-focused select that's invalid is ringed at full strength", async ({ page }) => {
  const { weight, unit } = await openMeasurementSheet(page)
  await markInvalid(unit)
  await expectFullRingOnceTabbedTo(page, unit, weight, "Tab")
})

test("a keyboard-focused button that's invalid is ringed at full strength", async ({ page }) => {
  const { change, weight } = await openMeasurementSheet(page)
  await markInvalid(change)
  await expectFullRingOnceTabbedTo(page, change, weight, "Shift+Tab")
})

test("a keyboard-focused chip that's invalid is ringed at full strength", async ({ page }) => {
  await playEveryScreen(page)
  await page.goto("/history")
  const feeds = page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Feeds" })
  await expect(feeds).toBeVisible()
  await markInvalid(feeds)
  const changeDay = page.getByRole("navigation", { name: "Days" }).getByRole("button", { name: "Change day" })
  await expectFullRingOnceTabbedTo(page, feeds, changeDay, "Tab")
})

import AxeBuilder from "@axe-core/playwright"
import type { Locator, Page } from "@playwright/test"
import { quickAction } from "./played-household.ts"
import { playEveryScreen, SCREENS } from "./played-screens.ts"
import { STILL } from "./still.ts"
import { expect, test } from "./test.ts"

const WCAG_A_AND_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]
const BASE_UI_FOCUS_GUARDS = "[data-base-ui-focus-guard]"

const violationsOn = async (page: Page) => {
  await page.addStyleTag({ content: STILL })
  expect(await page.evaluate("document.getAnimations().length")).toBe(0)
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AND_AA).exclude(BASE_UI_FOCUS_GUARDS).analyze()
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map(({ target }) => target.join(" ")).join(" | ")}`)
}

const expectNoViolations = async (page: Page) => {
  expect(await violationsOn(page)).toEqual([])
}

const openSheet = async (page: Page, opener: Locator) => {
  await opener.click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

const closeSheet = async (page: Page) => {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

const EDIT_SHEETS = [
  ["Pee and poo", "Edit diaper"],
  ["Nursing and bottle", "Edit feed"],
  ["Nap", "Edit sleep"],
  ["Vitamin D", "Edit dose"],
] as const

test.use({ timezoneId: "America/Vancouver" })

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme}`, () => {
    test.use({ colorScheme })

    test.beforeEach(async ({ page }) => {
      await playEveryScreen(page)
    })

    for (const { name, path, ready } of SCREENS) {
      test(`${name} passes axe`, async ({ page }) => {
        await page.goto(path)
        await expect(ready(page)).toBeVisible()
        await expectNoViolations(page)
      })
    }

    test("Today's sheets pass axe", async ({ page }) => {
      await page.goto("/")
      await expect(page.getByText("Totals")).toBeVisible()
      for (const name of ["Bottle", "Nursing", "Diaper", "Sleep"]) {
        await openSheet(page, quickAction(page, name))
        await expectNoViolations(page)
        await closeSheet(page)
      }
      await openSheet(page, page.getByRole("list", { name: "Supplements" }).getByRole("button").first())
      await expectNoViolations(page)
    })

    test("History's details, Log at and Go to pass axe", async ({ page }) => {
      await page.goto("/history")
      const grid = page.getByRole("region", { name: "The day by hour" })
      await openSheet(page, grid.getByRole("button", { name: /^Diaper/u }).first())
      await expectNoViolations(page)
      await closeSheet(page)
      await openSheet(page, grid.getByRole("button", { name: /^Log at 6/u }).first())
      await expectNoViolations(page)
      await closeSheet(page)
      await page.getByRole("navigation", { name: "Days" }).getByRole("button", { name: "Change" }).click()
      await expectNoViolations(page)
    })

    test("Today's edit sheets pass axe", async ({ page }) => {
      await page.goto("/")
      const recent = page.getByRole("list", { name: "Last 24 hours" })
      for (const [kind, name] of EDIT_SHEETS) {
        await openSheet(page, recent.getByRole("button").filter({ hasText: kind }).first())
        await expect(page.getByRole("dialog", { name })).toBeVisible()
        await expectNoViolations(page)
        await closeSheet(page)
      }
    })

    test("No connection passes axe", async ({ page, context }) => {
      await page.goto("/")
      await expect(page.getByText("Totals")).toBeVisible()
      await context.setOffline(true)
      await expect(page.getByText("No connection")).toBeVisible()
      await expectNoViolations(page)
    })

    test("Growth's and Settings' sheets pass axe", async ({ page }) => {
      await page.goto("/growth")
      await openSheet(page, page.getByRole("button", { name: "Add measurement" }).first())
      await expectNoViolations(page)
      await closeSheet(page)
      await openSheet(page, page.getByRole("button", { name: /^Edit the measurement from/u }).first())
      await expectNoViolations(page)
      await closeSheet(page)
      await page.goto("/settings")
      await openSheet(page, page.getByRole("button", { name: /^Vitamin D/u }))
      await expectNoViolations(page)
    })

    test.describe("on an iPhone's browser tab", () => {
      test.use({ storageState: { cookies: [], origins: [] } })

      test("the install card passes axe", async ({ page }) => {
        await page.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, "standalone", { configurable: true, get: () => false })
          Object.defineProperty(Navigator.prototype, "maxTouchPoints", { configurable: true, get: () => 5 })
        })
        await page.goto("/")
        await expect(page.getByRole("region", { name: "Install Baby tracker" })).toBeVisible()
        await expectNoViolations(page)
      })
    })
  })
}

import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { type OpenedSheet, openedSheet } from "./opened-sheets.ts"
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

type Opening = Pick<OpenedSheet, "dialog" | "open">

const openSheet = async (page: Page, { dialog, open }: Opening) => {
  await open(page)
  await expect(page.getByRole("dialog")).toHaveCount(1)
  await expect(page.getByRole("dialog", { name: dialog })).toBeVisible()
}

const closeSheet = async (page: Page) => {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

const expectNoViolationsIn = async (page: Page, opening: Opening) => {
  await openSheet(page, opening)
  await expectNoViolations(page)
  await closeSheet(page)
}

const VITAMIN_D_SHEET: Opening = {
  dialog: "Vitamin D",
  open: (page) =>
    page
      .getByRole("list", { name: "Supplements" })
      .getByRole("button", { name: /^Vitamin D/u })
      .click(),
}

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
        await expectNoViolationsIn(page, openedSheet(name))
      }
      await expectNoViolationsIn(page, VITAMIN_D_SHEET)
    })

    test("History's details, Log at and Go to pass axe", async ({ page }) => {
      await page.goto("/history")
      for (const name of ["History's details", "History's Log at"]) {
        await expectNoViolationsIn(page, openedSheet(name))
      }
      const days = page.getByRole("navigation", { name: "Days" })
      await days.getByRole("button", { name: "Change day", exact: true }).click()
      await expect(page.getByLabel("Go to", { exact: true })).toBeVisible()
      await expectNoViolations(page)
    })

    test("Today's edit sheets pass axe", async ({ page }) => {
      await page.goto("/")
      for (const name of ["Edit diaper", "Edit feed", "Edit sleep", "Edit dose"]) {
        await expectNoViolationsIn(page, openedSheet(name))
      }
    })

    test("No connection passes axe", async ({ page, context }) => {
      await page.goto("/")
      await expect(quickAction(page, "Bottle")).toBeEnabled()
      await context.setOffline(true)
      await expect(page.getByText("No connection")).toBeVisible()
      await expectNoViolations(page)
    })

    test("Growth's and Settings' sheets pass axe", async ({ page }) => {
      await page.goto("/growth")
      for (const name of ["Add measurement", "Edit measurement"]) {
        await expectNoViolationsIn(page, openedSheet(name))
      }
      await page.goto("/settings")
      await expectNoViolationsIn(page, VITAMIN_D_SHEET)
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

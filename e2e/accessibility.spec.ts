import { expectNoViolations, expectNoViolationsIn, type Opening, openSheet } from "./axe-gate.ts"
import { openedSheet } from "./opened-sheets.ts"
import {
  caregiversOf,
  MINUTE,
  NOW,
  playHousehold,
  quickAction,
  runningSleep,
  sleepingToday,
} from "./played-household.ts"
import { playEveryScreen, SCREENS } from "./played-screens.ts"
import { expect, test } from "./test.ts"

const VITAMIN_D_SHEET: Opening = {
  dialog: "Vitamin D",
  open: (page) =>
    page
      .getByRole("list", { name: "Supplements" })
      .getByRole("button", { name: /^Vitamin D/u })
      .click(),
}

const NEW_SUPPLEMENT_SHEET: Opening = {
  dialog: "Add a supplement",
  open: (page) => page.getByRole("button", { name: "Add a supplement" }).click(),
}

const GROWTH_POINT: Opening = {
  dialog: "Oct 6, 2026, 1 month 5 days, 4.30 kg, 47th",
  open: async (page) => {
    await page.getByRole("img", { name: /-for-age, girls, birth to/u }).focus()
    await page.keyboard.press("End")
    await page.keyboard.press("Enter")
  },
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
      for (const name of ["Bottle", "Nursing", "Diaper", "Sleep", "Past sleep"]) {
        await expectNoViolationsIn(page, openedSheet(name))
      }
      await expectNoViolationsIn(page, VITAMIN_D_SHEET)
    })

    test("Today with a running sleep passes axe", async ({ page }) => {
      const { andrew } = await caregiversOf(page)
      await playHousehold(page, sleepingToday(runningSleep(andrew.id, NOW - 40 * MINUTE)))
      await page.goto("/")
      await expect(page.getByText("Asleep now · Nap")).toBeVisible()
      await expectNoViolations(page)
      await openSheet(page, openedSheet("Sleep"))
      const sheet = page.getByRole("dialog", { name: "Sleep" })
      await expect(sheet.getByRole("timer")).toBeVisible()
      await expect(sheet.getByRole("button", { name: "Change, Fell asleep", exact: true })).toBeVisible()
      await expectNoViolations(page)
    })

    test("History's details, Log at and Go to pass axe", async ({ page }) => {
      await page.goto("/history")
      for (const name of ["History's details", "History's Log at", "Past feed"]) {
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
      await openSheet(page, openedSheet("Edit diaper's stale note"))
      await expectNoViolations(page)
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
      await expectNoViolationsIn(page, GROWTH_POINT)
      await page.goto("/settings")
      await expectNoViolationsIn(page, VITAMIN_D_SHEET)
      await expectNoViolationsIn(page, NEW_SUPPLEMENT_SHEET)
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

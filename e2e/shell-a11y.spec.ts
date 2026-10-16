import type { Locator, Page } from "@playwright/test"
import { emptyDay, openHistory, playHistory } from "./played-day.ts"
import {
  caregiversOf,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  savedBy,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const rectOf = (target: Locator) =>
  target.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect()
    return { top, bottom }
  })

const firstReaching = async (rows: Locator, coverTop: number) => {
  for (const row of await rows.all()) {
    if ((await rectOf(row)).bottom > coverTop) return row
  }
  throw new Error("No row reaches the bar")
}

const focusUnder = async (page: Page, rows: Locator, bar: Locator) => {
  await expect(rows.first()).toBeVisible()
  await page.evaluate("window.scrollTo(0, 0)")
  const coverTop = (await rectOf(bar)).top
  const row = await firstReaching(rows, coverTop)
  const { top } = await rectOf(row)
  await page.evaluate(`window.scrollBy(0, ${top - (coverTop - 10)})`)
  await page.evaluate("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))")
  await row.focus()
  return { row, barTop: (await rectOf(bar)).top }
}

test("names each screen in its page title", async ({ page }) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await expect(page).toHaveTitle("Today · Baby tracker")
  for (const [tab, title] of [
    ["History", "History"],
    ["Trends", "Trends"],
    ["Growth", "Growth"],
    ["Settings", "Settings"],
  ] as const) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: tab }).click()
    await expect(page).toHaveTitle(`${title} · Baby tracker`)
  }
  await page.goto("/settings/deleted")
  await expect(page).toHaveTitle("Recently deleted · Baby tracker")
})

test("a focused hour row never sits under the tab bar", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-08")])
  await openHistory(page, "?date=2026-10-08")
  const rows = page.getByRole("region", { name: "The day by hour" }).getByRole("button", { name: /^Log at / })
  const { row, barTop } = await focusUnder(page, rows, page.getByRole("navigation", { name: "Main" }))
  await expect.poll(async () => (await rectOf(row)).bottom).toBeLessThanOrEqual(barTop)
})

test("a focused row on Today never sits under the quick actions", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const diapers = Array.from({ length: 14 }, (_, index) => ({
    kind: "diaper" as const,
    diaper: {
      id: `diaper-${index}`,
      occurredAt: NOW - (index + 1) * 20 * MINUTE,
      wet: true,
      dirty: false,
      ...savedBy(andrew.id),
    },
  }))
  await playHousehold(page, { ...todayWith(), recent: diapers })
  await openToday(page)
  const rows = page.getByRole("list", { name: "Last 24 hours" }).getByRole("button")
  const bar = page.getByRole("region", { name: "Log", exact: true })
  const { row, barTop } = await focusUnder(page, rows, bar)
  await expect.poll(async () => (await rectOf(row)).bottom).toBeLessThanOrEqual(barTop)
})

test.describe("with Reduce Motion on", () => {
  test.use({ reducedMotion: "reduce" })

  test("a sheet fades in place instead of sliding, and buttons don't animate", async ({ page }) => {
    await playHousehold(page, todayWith())
    await openToday(page)
    const bottle = quickAction(page, "Bottle")
    expect(
      await bottle.evaluate(
        (element) => element.ownerDocument.defaultView?.getComputedStyle(element).transitionDuration,
      ),
    ).toBe("0s")
    await quickAction(page, "Diaper").click()
    const popup = page.locator('[data-slot="drawer-popup"]')
    await expect(popup).toBeVisible()
    expect(
      await popup.evaluate((element) =>
        (
          element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue("--closed-transform") ?? ""
        ).trim(),
      ),
    ).toBe("none")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })
})

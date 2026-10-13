import { expect, type Locator, type Page, test } from "@playwright/test"
import { busyDay, DAY, dayHeading, emptyDay, measurement, NO_TOTALS, openHistory, playHistory } from "./played-day.ts"
import { LAST_WEEK, playWeeks, THIS_WEEK, weekGrid, weekHeading, weekOf } from "./played-week.ts"

test.use({ timezoneId: "Europe/London" })

const LOGGED = { ...NO_TOTALS, feedsStarted: 5, diapers: 3, wetDiapers: 2, dirtyDiapers: 2 }

const playBusyWeek = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [])
  const busy = { ...busyDay(andrew, emily), totals: LOGGED }
  played.days.push(busy, emptyDay("2026-10-06"), emptyDay("2026-09-28"))
  const asked = await playWeeks(page, {
    [THIS_WEEK]: weekOf(THIS_WEEK, [busy]),
    [LAST_WEEK]: weekOf(LAST_WEEK, []),
    "2026-W38": weekOf("2026-W38", []),
  })
  return { played, asked, andrew }
}

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (box === null) throw new Error(`${locator} isn't on screen to measure`)
  return box
}

test("shows the week as seven days, each one up to today opening its Day view", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await expect(weekHeading(page)).toHaveText(/^Oct 5\s–\s11$/u)
  const days = weekGrid(page).getByRole("link")
  await expect(days).toHaveCount(5)
  await expect(days.first()).toHaveAccessibleName("Mon, Oct 5: nothing logged")
  const friday = weekGrid(page).getByRole("link", { name: "Fri, Oct 9: 5 feeds started; 3 diapers, 2 pee, 2 poo" })
  await friday.click()
  await expect(page).toHaveURL(/\/history$/u)
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

test("fits all 24 hours of the week on the screen, above the tab bar", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await expect(weekGrid(page).getByRole("link")).toHaveCount(5)
  const grid = await weekGrid(page).boundingBox()
  const tabs = await page.getByRole("navigation", { name: "Main" }).boundingBox()
  expect((grid?.y ?? 0) + (grid?.height ?? 0)).toBeLessThanOrEqual(tabs?.y ?? 0)
  expect(await page.evaluate<number>("document.documentElement.scrollHeight - window.innerHeight")).toBeLessThanOrEqual(
    1,
  )
  const column = await boxOf(weekGrid(page).getByRole("link").first())
  const sixPm = await boxOf(page.getByText("6 PM", { exact: true }))
  expect(sixPm.y + sixPm.height / 2 - column.y).toBeCloseTo(0.75 * column.height, 0)
  const friday = await boxOf(weekGrid(page).getByRole("link", { name: /^Fri, Oct 9/u }))
  const now = await boxOf(weekGrid(page).locator(".border-t-2"))
  expect(now.y - friday.y).toBeCloseTo((57 / 144) * friday.height, 0)
})

test("steps back a week and comes back to this week", async ({ page }) => {
  const { asked } = await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await page.getByRole("link", { name: "Previous week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week&date=2026-09-28$/u)
  await expect(weekHeading(page)).toHaveText(/^Sep 28\s–\sOct 4$/u)
  expect(asked).toContain(LAST_WEEK)
  await page.getByRole("link", { name: "Back to this week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week$/u)
  await expect(weekHeading(page)).toHaveText(/^Oct 5\s–\s11$/u)
  await expect(page.getByRole("link", { name: "Next week" })).toHaveCount(0)
})

test("doesn't call a day's column the current page", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await expect(weekGrid(page).getByRole("link")).toHaveCount(5)
  await expect(weekGrid(page).locator('[aria-current="page"]')).toHaveCount(0)
  await page.getByRole("link", { name: "Previous week" }).click()
  await expect(weekGrid(page).getByRole("link")).toHaveCount(7)
  await expect(weekGrid(page).locator('[aria-current="page"]')).toHaveCount(0)
})

test("switches from a day to the week that holds it, and back to today", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-09-28")
  await page.getByRole("group", { name: "History by" }).getByRole("button", { name: "Week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week&date=2026-09-28$/u)
  await page.getByRole("link", { name: "Back to this week" }).click()
  await page.getByRole("group", { name: "History by" }).getByRole("button", { name: "Day" }).click()
  await expect(page).toHaveURL(/\/history$/u)
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

test("hides a kind on both views, and keeps it while stepping and switching", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  const chips = page.getByRole("group", { name: "Show" })
  await chips.getByRole("button", { name: "Diapers" }).click()
  await expect(chips.getByRole("button", { name: "Diapers" })).toHaveAttribute("aria-pressed", "false")
  await expect(page).toHaveURL(/\/history\?view=week&hide=diapers$/u)
  await expect(weekGrid(page).getByRole("link", { name: "Fri, Oct 9: 5 feeds started", exact: true })).toBeVisible()
  const legend = weekGrid(page)
  await expect(legend.getByText("Nursing", { exact: true })).toBeVisible()
  await expect(legend.getByText("Diaper", { exact: true })).toHaveCount(0)
  await weekGrid(page)
    .getByRole("link", { name: /^Fri, Oct 9/u })
    .click()
  await expect(page).toHaveURL(/\/history\?hide=diapers$/u)
  const day = page.getByRole("region", { name: "The day by hour" })
  await expect(day.getByRole("button", { name: "Bottle at 4:00 AM: 90 mL" })).toBeVisible()
  await expect(day.getByRole("button", { name: /^Diaper at/u })).toHaveCount(0)
  await page.getByRole("link", { name: "Previous day" }).click()
  await expect(page).toHaveURL(/\/history\?date=2026-10-08&hide=diapers$/u)
})

test("hides Growth's strip on the Day view, and says nothing was logged only when nothing was", async ({ page }) => {
  const { played, andrew } = await playHistory(page, [])
  const weighed = {
    ...emptyDay(DAY),
    measurements: [measurement("m", Date.parse(`${DAY}T08:00:00-07:00`), 4210, 55, 37.5, andrew)],
  }
  played.days.push(weighed)
  await openHistory(page, "?hide=growth")
  await expect(page.getByRole("region", { name: "The day by hour" })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Edit the measurement/u })).toHaveCount(0)
  await expect(page.getByText("Nothing logged.")).toHaveCount(0)
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Growth" }).click()
  await expect(page.getByRole("button", { name: "Edit the measurement from 8:00 AM" })).toBeVisible()
})

test.describe("on a narrow screen", () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test("scrolls the week sideways, keeping the hours in view", async ({ page }) => {
    await playBusyWeek(page)
    await openHistory(page, "?view=week")
    const scroller = weekGrid(page).locator("ol").locator("..")
    const sizes = await scroller.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }))
    expect(sizes.scroll).toBeGreaterThan(sizes.client)
    const hours = page.getByText("6 AM", { exact: true })
    const before = await hours.boundingBox()
    await scroller.evaluate((node) => node.scrollBy({ left: 200 }))
    await expect.poll(async () => (await hours.boundingBox())?.x).toBe(before?.x)
    await expect(weekGrid(page).getByRole("link", { name: /^Fri, Oct 9/u })).toBeInViewport()
  })
})

test.describe("on a short screen", () => {
  test.use({ viewport: { width: 393, height: 300 } })

  test("keeps the hours under the switcher and the tab bar while the page scrolls", async ({ page }) => {
    await playBusyWeek(page)
    await openHistory(page, "?view=week")
    await expect(weekGrid(page).getByRole("link")).toHaveCount(5)
    await page.evaluate("window.scrollTo(0, 120)")
    const tabs = page.getByRole("navigation", { name: "Main" })
    await tabs.getByRole("link", { name: "Today" }).click({ trial: true, timeout: 2000 })
    await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    await page.getByRole("link", { name: "Previous week" }).click({ trial: true, timeout: 2000 })
  })
})

test("keeps the day switcher at the top while the day scrolls", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  await expect(page.getByRole("region", { name: "The day by hour" })).toBeVisible()
  await page.evaluate("window.scrollTo(0, 800)")
  await expect.poll(() => page.evaluate<number>("window.scrollY")).toBeGreaterThan(400)
  await expect(page.getByRole("navigation", { name: "Days" })).toBeInViewport()
})

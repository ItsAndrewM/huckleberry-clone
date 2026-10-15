import type { Locator, Page } from "@playwright/test"
import { datesFrom, openTrends, periodOf, playTrends, TRENDS_DAYS } from "./played-period.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const WEEK = periodOf(datesFrom("2026-10-05", 7), TRENDS_DAYS)
const LAST_WEEK = periodOf(datesFrom("2026-09-28", 7), TRENDS_DAYS)
const OCTOBER = periodOf(datesFrom("2026-10-01", 31), TRENDS_DAYS)
const HINT = "Showing averages. Tap a day to see its numbers"

const playWeeks = (page: Page) =>
  playTrends(page, { weeks: { "2026-W41": WEEK, "2026-W40": LAST_WEEK }, months: { "2026-10": OCTOBER } })

const chart = (page: Page, name: string) => page.getByRole("region", { name })
const periods = (page: Page) => page.getByRole("navigation", { name: /weeks|months/u })

const barOf = (page: Page, name: string, date: string) =>
  chart(page, name).locator(`[data-ts-key^="days:"][data-ts-key*=":${date}:"]`).first()

const rectOf = (target: Locator) =>
  target.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x, y, width, height }
  })

const tapDay = async (page: Page, name: string, date: string) => {
  const bar = barOf(page, name, date)
  await bar.scrollIntoViewIfNeeded()
  const box = await rectOf(bar)
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}

const tapColumn = async (page: Page, name: string, weekday: string) => {
  const plot = chart(page, name).getByRole("img")
  await plot.scrollIntoViewIfNeeded()
  const frame = await plot.boundingBox()
  if (frame === null) throw new Error(`No ${name} chart`)
  const tick = await chart(page, name)
    .locator('text[data-ts-key^="x-tick-label"]', { hasText: weekday })
    .evaluate((label) => {
      const { x, y, width } = label.getBoundingClientRect()
      return { x, y, width }
    })
  await page.touchscreen.tap(tick.x + tick.width / 2, frame.y + (tick.y - frame.y) / 2)
}

const pickedDay = (page: Page) => page.getByRole("main").getByRole("status").first()
const pickedLine = (page: Page) => pickedDay(page).locator("..")
const clearPick = (page: Page) => page.getByRole("button", { name: "Back to the averages" })

const expectTuesday = async (page: Page) => {
  await expect(chart(page, "Feeds started")).toContainText(/^Feeds started7/u)
  await expect(chart(page, "Nursing")).toContainText(/1 h 20 min\s*Left 40 min\s·\sRight 40 min/u)
  await expect(chart(page, "Bottles")).toContainText(/520 mL\s*Breast milk 520 mL/u)
  await expect(chart(page, "Diapers")).toContainText(/7\s*5 pee\s·\s3 poo/u)
}

test("opens on this week, so far, with each chart's average over the days that have finished", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await expect(periods(page).getByRole("heading")).toHaveText(/^Oct 5\s–\s11$/u)
  await expect(periods(page)).toContainText("This week, so far")
  await expect(chart(page, "Feeds started")).toContainText("8 a day, over 4 days")
  await expect(chart(page, "Nursing")).toContainText("1 h 37 min a day, over 4 days")
  await expect(chart(page, "Nursing")).toContainText(/Left 48 min\s·\sRight 49 min/u)
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await expect(chart(page, "Diapers")).toContainText(/8 a day, over 4 days/u)
  await expect(chart(page, "Diapers").getByRole("img")).toHaveAccessibleName("Diapers each day")
  await expect(chart(page, "Nursing").getByRole("img")).toHaveAccessibleName("Nursing each day, in minutes")
  await expect(chart(page, "Bottles").getByRole("img")).toHaveAccessibleName("Bottles each day, in mL")
})

test("leaves a day with nothing logged out of the averages, and says so in the table", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page, "?date=2026-09-28")
  await expect(periods(page).getByRole("heading")).toHaveText(/^Sep 28\s–\sOct 4$/u)
  await expect(chart(page, "Feeds started")).toContainText("8.5 a day, over 2 days")
  await page.getByText("Show as a table", { exact: true }).click()
  const table = page.getByRole("table")
  await expect(table.getByRole("row", { name: /Wed, Sep 30/u })).toContainText("No entries")
  await expect(table.getByRole("row", { name: /Fri, Oct 2/u }).getByRole("cell")).toHaveText([
    "8",
    "1 h 35 min",
    "420 mL",
    "7",
    "0 min",
  ])
})

test("picks a day on the Feeds started, Nursing, Bottles and Diapers charts with one tap, without moving them, and goes back to the averages", async ({
  page,
}) => {
  await playWeeks(page)
  await openTrends(page)
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await expect(pickedDay(page)).toBeAttached()
  await expect(pickedDay(page)).toHaveText(HINT)
  await expect(clearPick(page)).toHaveCount(0)
  const tuesday = barOf(page, "Diapers", "2026-10-06")
  await tuesday.scrollIntoViewIfNeeded()
  const before = await rectOf(tuesday)
  await page.touchscreen.tap(before.x + before.width / 2, before.y + 4)
  await expect(pickedDay(page)).toHaveText("Tue, Oct 6")
  await expectTuesday(page)
  expect(Math.abs((await rectOf(tuesday)).y - before.y)).toBeLessThanOrEqual(1)
  const box = await clearPick(page).boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
  await clearPick(page).click()
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await expect(pickedDay(page)).toHaveText(HINT)
  await expect(clearPick(page)).toHaveCount(0)
  await expect(chart(page, "Feeds started").getByRole("img")).toBeFocused()
})

test("keeps the picked line one row tall, picked or not, from 393 px down to 320 px wide", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 659 })
    await expect(pickedDay(page)).toHaveText(HINT)
    const empty = (await pickedLine(page).boundingBox())?.height
    await tapDay(page, "Bottles", "2026-10-06")
    await expect(pickedDay(page)).toHaveText("Tue, Oct 6")
    expect([width, empty, (await pickedLine(page).boundingBox())?.height]).toEqual([width, 44, 44])
    await clearPick(page).click()
    await expect(clearPick(page)).toHaveCount(0)
  }
})

test("picks today, and a finished day with nothing logged, each with its own numbers, without moving the tapped chart", async ({
  page,
}) => {
  await playWeeks(page)
  await openTrends(page, "?date=2026-09-28")
  await expect(chart(page, "Bottles")).toContainText("425 mL a day, over 2 days")
  const bottles = chart(page, "Bottles").getByRole("img")
  await bottles.scrollIntoViewIfNeeded()
  const before = await rectOf(bottles)
  await tapColumn(page, "Bottles", "Wed")
  await expect(pickedDay(page)).toHaveText("Wed, Sep 30")
  await expect(chart(page, "Bottles")).toContainText("No entries")
  await expect(chart(page, "Feeds started")).toContainText("No entries")
  expect(Math.abs((await rectOf(bottles)).y - before.y)).toBeLessThanOrEqual(1)
  await tapDay(page, "Bottles", "2026-10-02")
  await expect(pickedDay(page)).toHaveText("Fri, Oct 2")
  await expect(chart(page, "Bottles")).toContainText(/420 mL/u)
  await openTrends(page)
  await tapDay(page, "Feeds started", "2026-10-09")
  await expect(pickedDay(page)).toHaveText("Fri, Oct 9")
  await expect(chart(page, "Feeds started")).toContainText("3 so far")
})

test("does nothing when a day still to come is tapped", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await tapColumn(page, "Bottles", "Sat")
  await expect(pickedDay(page)).toHaveText(HINT)
  await expect(clearPick(page)).toHaveCount(0)
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await tapColumn(page, "Bottles", "Fri")
  await expect(pickedDay(page)).toHaveText("Fri, Oct 9")
})

test("picks a day from the keyboard, and moves focus to the first chart when × lets it go", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await chart(page, "Diapers").getByRole("img").focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  await expect(pickedDay(page)).toHaveText("Tue, Oct 6")
  await expectTuesday(page)
  await clearPick(page).focus()
  await page.keyboard.press("Enter")
  await expect(pickedDay(page)).toHaveText(HINT)
  await expect(chart(page, "Feeds started").getByRole("img")).toBeFocused()
})

test("puts the averages back when the picked day is tapped again at the same spot", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  const tuesday = barOf(page, "Diapers", "2026-10-06")
  await tuesday.scrollIntoViewIfNeeded()
  const { x, y, width } = await rectOf(tuesday)
  await page.touchscreen.tap(x + width / 2, y + 4)
  await expect(pickedDay(page)).toHaveText("Tue, Oct 6")
  await page.touchscreen.tap(x + width / 2, y + 4)
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await expect(clearPick(page)).toHaveCount(0)
  await expect(pickedDay(page)).toHaveText(HINT)
})

test("lets a picked day go when stepping to another week, and does not bring it back", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await tapDay(page, "Bottles", "2026-10-06")
  await expect(pickedDay(page)).toHaveText("Tue, Oct 6")
  await periods(page).getByRole("link", { name: "Previous week" }).click()
  await expect(page).toHaveURL(/\/trends\?date=2026-09-28$/u)
  await expect(chart(page, "Bottles")).toContainText("425 mL a day, over 2 days")
  await expect(clearPick(page)).toHaveCount(0)
  await periods(page).getByRole("link", { name: "Back to this week" }).click()
  await expect(page).toHaveURL(/\/trends$/u)
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await expect(clearPick(page)).toHaveCount(0)
  await expect(pickedDay(page)).toHaveText(HINT)
})

test("lets a picked day go when switching to the month and back to the week", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await tapDay(page, "Bottles", "2026-10-06")
  await expect(pickedDay(page)).toHaveText("Tue, Oct 6")
  await page.getByRole("button", { name: "Month" }).click()
  await expect(page).toHaveURL(/\/trends\?view=month$/u)
  await expect(chart(page, "Feeds started")).toContainText("8.2 a day, over 6 days")
  await expect(clearPick(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Week", exact: true }).click()
  await expect(page).toHaveURL(/\/trends$/u)
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await expect(clearPick(page)).toHaveCount(0)
  await expect(pickedDay(page)).toHaveText(HINT)
})

test("steps back a week and forward again, and never past this week", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await expect(periods(page).getByRole("link", { name: "Next week" })).toHaveCount(0)
  await periods(page).getByRole("link", { name: "Previous week" }).click()
  await expect(page).toHaveURL(/\/trends\?date=2026-09-28$/u)
  const back = periods(page).getByRole("link", { name: "Back to this week" })
  const next = periods(page).getByRole("link", { name: "Next week" })
  await expect(back).toBeVisible()
  expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await expect(back).not.toHaveAttribute("aria-current")
  await expect(next).not.toHaveAttribute("aria-current")
  await next.click()
  await expect(page).toHaveURL(/\/trends$/u)
})

test("shows this month so far, a bar a day, with its average", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await page.getByRole("button", { name: "Month" }).click()
  await expect(page).toHaveURL(/\/trends\?view=month$/u)
  await expect(periods(page).getByRole("heading")).toHaveText("October 2026")
  await expect(periods(page)).toContainText("This month, so far")
  await expect(chart(page, "Feeds started")).toContainText("8.2 a day, over 6 days")
  await expect(chart(page, "Feeds started").locator('text[data-ts-key^="x-tick-label"]')).toHaveText([
    "1",
    "8",
    "15",
    "22",
    "29",
  ])
})

test("loads the week on Try again, once the household answers", async ({ page }) => {
  await playWeeks(page)
  let refusing = true
  await page.route(/\/api\/weeks\/2026-W41$/u, (route) =>
    refusing ? route.fulfill({ status: 404 }) : route.fallback(),
  )
  await openTrends(page)
  await expect(page.getByText("This week couldn't be loaded.")).toBeVisible()
  refusing = false
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(chart(page, "Feeds started")).toContainText("8 a day, over 4 days")
})

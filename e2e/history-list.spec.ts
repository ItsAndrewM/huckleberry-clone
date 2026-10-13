import { expect, type Page, test } from "@playwright/test"
import {
  busyDay,
  DAY,
  type DayAnswer,
  dayHeading,
  emptyDay,
  NO_TOTALS,
  openHistory,
  playHistory,
} from "./played-day.ts"

test.use({ timezoneId: "Europe/London" })

const theList = (page: Page) => page.getByRole("region", { name: "The day's entries" })

const switchTo = (page: Page, view: "Day" | "Week" | "List") =>
  page.getByRole("group", { name: "History by" }).getByRole("button", { name: view }).click()

const playBusyDay = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [emptyDay("2026-10-08")])
  const day = busyDay(andrew, emily)
  played.days.push(day)
  return day
}

const playToday = (page: Page, activeFeed: DayAnswer["feeds"][number] | null = null) =>
  page.route("**/api/today", (route) =>
    route.fulfill({
      json: {
        date: DAY,
        totals: NO_TOTALS,
        activeFeed,
        lastFeed: activeFeed,
        prefill: { lastBottle: { breastMilkMl: 0, formulaMl: 90 }, lastSide: "left" },
        recent: [],
      },
    }),
  )

test("lists the day's feeds and diapers earliest first, each as Today shows it", async ({ page }) => {
  await playBusyDay(page)
  await openHistory(page, "?view=list")
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await expect(page.getByRole("region", { name: "The day by hour" })).toHaveCount(0)
  const rows = theList(page).getByRole("listitem")
  await expect(rows).toHaveCount(8)
  await expect(rows.nth(0)).toContainText(/Nursing\s*Left 35 min\s*Thu\s11:40\sPM\s–\s12:15\sAM\s*Andrew \(local\)/u)
  await expect(rows.nth(1)).toContainText(/Nursing\s*Left 14 min · Right 9 min\s*1:05\s–\s1:28\sAM/u)
  await expect(rows.nth(2)).toContainText(/Diaper\s*Pee\s*2:10\sAM\s*Emily \(local\)/u)
  await expect(rows.nth(3)).toContainText(/Diaper\s*Poo\s*2:20\sAM/u)
  await expect(rows.nth(4)).toContainText(
    /Nursing and bottle\s*Left 10 min · Right 10 min · 60 mL\s*3:00\s–\s3:45\sAM/u,
  )
  await expect(rows.nth(5)).toContainText(/Bottle\s*90 mL\s*4:00\sAM/u)
  await expect(rows.nth(6)).toContainText(/Diaper\s*Pee and poo\s*5:30\sAM/u)
  await expect(rows.nth(7)).toContainText(/Nursing\s*In progress · Left 20 min\s*9:10\sAM/u)
})

test.describe("on a 320-pixel-wide phone", () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test("wraps a long time rather than covering the row's title", async ({ page }) => {
    await playBusyDay(page)
    await openHistory(page, "?view=list")
    const first = theList(page).getByRole("listitem").first()
    await expect(first.locator("time")).toHaveText(/^Thu\s11:40\sPM\s–\s12:15\sAM$/u)
    for (const text of ["Nursing", "Left 35 min"]) {
      const overflow = await first
        .getByText(text, { exact: true })
        .evaluate((shown) => shown.scrollWidth - shown.clientWidth)
      expect(overflow, `${text} overflows its box`).toBe(0)
    }
    expect(await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")).toBe(0)
  })
})

test("switches a day between its grid and its list, and to this week and back to today's list", async ({ page }) => {
  await playBusyDay(page)
  await openHistory(page, "?date=2026-10-08")
  await switchTo(page, "List")
  await expect(page).toHaveURL(/\/history\?view=list&date=2026-10-08$/u)
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await switchTo(page, "Day")
  await expect(page).toHaveURL(/\/history\?date=2026-10-08$/u)
  await expect(page.getByRole("region", { name: "The day by hour" })).toBeVisible()
  await switchTo(page, "List")
  await switchTo(page, "Week")
  await expect(page).toHaveURL(/\/history\?view=week$/u)
  await switchTo(page, "List")
  await expect(page).toHaveURL(/\/history\?view=list$/u)
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

test("steps through days as a list, with a way back to today's", async ({ page }) => {
  await playBusyDay(page)
  await openHistory(page, "?view=list")
  await page.getByRole("link", { name: "Previous day" }).click()
  await expect(page).toHaveURL(/\/history\?view=list&date=2026-10-08$/u)
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await expect(page.getByText("Nothing logged.")).toBeVisible()
  await expect(theList(page).getByRole("listitem")).toHaveCount(0)
  await page.getByRole("link", { name: "Back to today" }).click()
  await expect(page).toHaveURL(/\/history\?view=list$/u)
  await expect(theList(page).getByRole("listitem")).toHaveCount(8)
  await page.goBack()
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
})

test("opens a row's details with Edit, as the grid does", async ({ page }) => {
  await playBusyDay(page)
  await openHistory(page, "?view=list")
  await theList(page)
    .getByRole("button", { name: /^Nursing and bottle/u })
    .click()
  const sheet = page.getByRole("dialog", { name: "Nursing and bottle" })
  await expect(sheet).toContainText(/Fri, Oct 9, 3:00\s–\s3:45\sAM/u)
  await expect(sheet.getByRole("button", { name: "Edit" })).toBeVisible()
  await sheet.getByRole("button", { name: "Close" }).click()
  await expect(sheet).toBeHidden()
})

test("opens the Nursing sheet for a feed that's still going", async ({ page }) => {
  const day = await playBusyDay(page)
  await playToday(page, day.feeds.find(({ id }) => id === "running") ?? null)
  await openHistory(page, "?view=list")
  await theList(page)
    .getByRole("button", { name: /^Nursing\s*In progress/u })
    .click()
  await expect(page.getByRole("dialog", { name: "Nursing" }).getByRole("button", { name: "Pause" })).toBeVisible()
})

test("hides a kind's rows with its chip, and keeps the list while stepping", async ({ page }) => {
  await playBusyDay(page)
  await openHistory(page, "?view=list")
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Diapers" }).click()
  await expect(page).toHaveURL(/\/history\?view=list&hide=diapers$/u)
  await expect(page.getByText("Diapers hidden", { exact: true })).toBeVisible()
  await expect(theList(page).getByRole("listitem")).toHaveCount(5)
  await expect(theList(page).getByText("Diaper", { exact: true })).toHaveCount(0)
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Feeds" }).click()
  await expect(theList(page).getByText("Nothing shown.")).toBeVisible()
  await page.getByRole("link", { name: "Previous day" }).click()
  await expect(page).toHaveURL(/\/history\?view=list&date=2026-10-08&hide=feeds(?:%2C|,)diapers$/u)
})

test("logs on an earlier day at the same clock time, and on today at now", async ({ page }) => {
  await playBusyDay(page)
  await playToday(page)
  await openHistory(page, "?view=list&date=2026-10-08")
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page.getByRole("dialog", { name: "Log at 9:30 AM" }).getByRole("button", { name: "Diaper" }).click()
  await expect(page.getByRole("dialog", { name: "Diaper" }).getByLabel("When")).toHaveValue("2026-10-08T09:30")
  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "Next day" }).click()
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page.getByRole("dialog", { name: "Log at 9:30 AM" }).getByRole("button", { name: "Bottle" }).click()
  await expect(page.getByRole("dialog", { name: "Bottle" }).getByLabel("When")).toHaveValue("2026-10-09T09:30")
})

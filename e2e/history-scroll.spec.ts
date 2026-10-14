import { expect, type Page, test } from "@playwright/test"
import { busyDay, dayHeading, diaper, emptyDay, local, openHistory, playHistory } from "./played-day.ts"
import { muteLiveUpdates, playHousehold, todayWith } from "./played-household.ts"
import { datesFrom, openTrends, periodOf, playTrends, TRENDS_DAYS } from "./played-period.ts"
import { playWeeks, THIS_WEEK, weekGrid, weekOf } from "./played-week.ts"

test.use({ timezoneId: "America/Vancouver" })

const YESTERDAY = "2026-10-08"

test.beforeEach(({ page }) => muteLiveUpdates(page))

const playTodayAndYesterday = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [])
  const today = busyDay(andrew, emily)
  played.days.push(today, {
    ...emptyDay(YESTERDAY),
    diapers: [diaper("evening", local("20:00", YESTERDAY), true, false, emily)],
  })
  await playWeeks(page, { [THIS_WEEK]: weekOf(THIS_WEEK, [today]) })
}

const playTrendsWeeks = (page: Page) =>
  playTrends(page, {
    weeks: {
      "2026-W40": periodOf(datesFrom("2026-09-28", 7), TRENDS_DAYS),
      [THIS_WEEK]: periodOf(datesFrom("2026-10-05", 7), TRENDS_DAYS),
    },
    months: {},
  })

const listRows = (page: Page) => page.getByRole("region", { name: "The day's entries" }).getByRole("listitem")

const nowRow = (page: Page) =>
  page.getByRole("region", { name: "The day by hour" }).getByRole("button", { name: "Log at 9 AM", exact: true })

const yesterdaysDiaper = (page: Page) => page.getByRole("button", { name: "Diaper at 8:00 PM: Pee" })

const afterFrames = (page: Page) =>
  page.evaluate("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))")

const scrollTop = (page: Page) => page.evaluate<number>("window.scrollY")

const scrollableHeight = (page: Page) =>
  page.evaluate<number>("document.documentElement.scrollHeight - window.innerHeight")

const viewButton = (page: Page, view: "Day" | "Week" | "List") =>
  page.getByRole("group", { name: "History by" }).getByRole("button", { name: view })

const switchTo = (page: Page, view: "Day" | "Week" | "List") => viewButton(page, view).click()

const switchWithoutScrolling = (page: Page, view: "Day" | "Week" | "List") =>
  viewButton(page, view).dispatchEvent("click")

const days = (page: Page) => page.getByRole("navigation", { name: "Days" })

const toggleChipWithoutScrolling = (page: Page, kind: "Diapers" | "Growth") =>
  page.getByRole("group", { name: "Show" }).getByRole("button", { name: kind }).dispatchEvent("click")

const expectTodayAtNow = async (page: Page) => {
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await expect(nowRow(page)).toBeAttached()
  await afterFrames(page)
  await expect(nowRow(page)).toBeInViewport()
}

const expectYesterdayAtItsEntry = async (page: Page) => {
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await expect(yesterdaysDiaper(page)).toBeAttached()
  await afterFrames(page)
  await expect(yesterdaysDiaper(page)).toBeInViewport()
}

test("opens today's grid at now after its list", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page, "?view=list")
  await expect(listRows(page)).toHaveCount(8)
  await switchTo(page, "Day")
  await expectTodayAtNow(page)
})

test("opens today's grid at now after the week", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page)
  await expectTodayAtNow(page)
  await switchTo(page, "Week")
  await expect(weekGrid(page)).toBeVisible()
  await switchTo(page, "Day")
  await expectTodayAtNow(page)
})

test("opens today's grid at now from its column on the week", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page)
  await expectTodayAtNow(page)
  await switchTo(page, "Week")
  await weekGrid(page)
    .getByRole("link", { name: /^Fri, Oct 9/u })
    .click()
  await expectTodayAtNow(page)
})

test("opens today's grid at now when Next day comes back to it", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page)
  await expectTodayAtNow(page)
  await days(page).getByRole("link", { name: "Previous day" }).click()
  await expectYesterdayAtItsEntry(page)
  await days(page).getByRole("link", { name: "Next day" }).click()
  await expectTodayAtNow(page)
})

test("opens today's grid at now from Back to today", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page)
  await expectTodayAtNow(page)
  await days(page).getByRole("link", { name: "Previous day" }).click()
  await expectYesterdayAtItsEntry(page)
  await days(page).getByRole("link", { name: "Back to today" }).click()
  await expectTodayAtNow(page)
})

test("opens an earlier day's grid at its first entry when Previous day comes back to it", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page, `?date=${YESTERDAY}`)
  await expectYesterdayAtItsEntry(page)
  await days(page).getByRole("link", { name: "Next day" }).click()
  await expectTodayAtNow(page)
  await days(page).getByRole("link", { name: "Previous day" }).click()
  await expectYesterdayAtItsEntry(page)
})

test("opens an earlier day's grid at its first entry from Go to", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page, `?date=${YESTERDAY}`)
  await expectYesterdayAtItsEntry(page)
  await days(page).getByRole("link", { name: "Next day" }).click()
  await expectTodayAtNow(page)
  await days(page).getByRole("button", { name: "Change" }).click()
  await page.getByLabel("Go to").fill(YESTERDAY)
  await expectYesterdayAtItsEntry(page)
})

test("opens today's grid at now from the History tab, after another tab", async ({ page }) => {
  await playTodayAndYesterday(page)
  await playHousehold(page, todayWith())
  await openHistory(page)
  await expectTodayAtNow(page)
  const tabs = page.getByRole("navigation", { name: "Main" })
  await tabs.getByRole("link", { name: "Today" }).click()
  await expect(page.getByText("Totals")).toBeVisible()
  await tabs.getByRole("link", { name: "History" }).click()
  await expectTodayAtNow(page)
})

test("opens today's grid at now from Trends' day", async ({ page }) => {
  await playTodayAndYesterday(page)
  await playTrendsWeeks(page)
  await openTrends(page, "?view=day")
  await page.getByRole("link", { name: "Open in History" }).click()
  await expect(page).toHaveURL(/\/history$/u)
  await expectTodayAtNow(page)
})

test("opens today's grid at now from a day in Trends' table", async ({ page }) => {
  await playTodayAndYesterday(page)
  await playTrendsWeeks(page)
  await openHistory(page)
  await expectTodayAtNow(page)
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Trends" }).click()
  await page.getByText("Show as a table", { exact: true }).click()
  await page.getByRole("table").getByRole("link", { name: "Fri, Oct 9" }).click()
  await expect(page).toHaveURL(/\/history$/u)
  await expectTodayAtNow(page)
})

test("keeps the grid where it is when a chip hides a kind", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page)
  await expectTodayAtNow(page)
  await toggleChipWithoutScrolling(page, "Diapers")
  await expect(page.getByText("Diapers hidden", { exact: true })).toBeVisible()
  await afterFrames(page)
  await expect(nowRow(page)).toBeInViewport()
})

test("keeps the list where it is when a chip hides a kind", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page, "?view=list")
  const lastRow = listRows(page).last()
  await expect(listRows(page)).toHaveCount(8)
  await expect(lastRow).not.toBeInViewport()
  await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
  await expect(lastRow).toBeInViewport()
  await toggleChipWithoutScrolling(page, "Growth")
  await expect(page.getByText("Growth hidden", { exact: true })).toBeVisible()
  await afterFrames(page)
  await expect(lastRow).toBeInViewport()
})

test("still opens an earlier day's list at its top when Previous day comes back to it", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  const today = busyDay(andrew, emily)
  const yesterdayAsLongAsToday = { ...emptyDay(YESTERDAY), feeds: today.feeds, diapers: today.diapers }
  played.days.push(today, yesterdayAsLongAsToday)
  await openHistory(page, `?view=list&date=${YESTERDAY}`)
  await expect(listRows(page)).toHaveCount(8)
  await days(page).getByRole("link", { name: "Next day" }).click()
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await expect(listRows(page)).toHaveCount(8)
  await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
  expect(await scrollTop(page)).toBeGreaterThan(0)
  await days(page).getByRole("link", { name: "Previous day" }).click()
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await afterFrames(page)
  expect(await scrollTop(page)).toBe(0)
})

test("still opens the list at its top after the grid", async ({ page }) => {
  await playTodayAndYesterday(page)
  await openHistory(page)
  await expectTodayAtNow(page)
  expect(await scrollTop(page)).toBeGreaterThan(0)
  await switchWithoutScrolling(page, "List")
  await expect(listRows(page)).toHaveCount(8)
  expect(await scrollableHeight(page)).toBeGreaterThan(0)
  await afterFrames(page)
  expect(await scrollTop(page)).toBe(0)
})

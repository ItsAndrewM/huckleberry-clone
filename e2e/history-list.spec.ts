import type { Page } from "@playwright/test"
import {
  busyDay,
  DAY,
  type DayAnswer,
  dayHeading,
  dose,
  emptyDay,
  local,
  NO_TOTALS,
  openHistory,
  playHistory,
  sleep,
  stopVitaminD,
} from "./played-day.ts"
import { expect, test } from "./test.ts"

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
        activeSleep: null,
        lastSleep: null,
        prefill: { lastBottle: { breastMilkMl: 0, formulaMl: 90 }, lastSide: "left" },
        recent: [],
        doses: [],
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

test("lists a dose by its time among the feeds and diapers, and opens its details with Edit", async ({ page }) => {
  const me = await (await page.request.get("/api/me")).json()
  const vitaminD = me.household.supplements.find(({ name }: { name: string }) => name === "Vitamin D")
  const { played, andrew, emily } = await playHistory(page, [emptyDay("2026-10-08")])
  played.days.push({ ...busyDay(andrew, emily), doses: [dose("dose-1", vitaminD.id, local("02:15"), emily)] })
  await openHistory(page, "?view=list")
  const rows = theList(page).getByRole("listitem")
  await expect(rows).toHaveCount(9)
  await expect(rows.nth(3)).toContainText(/Vitamin D\s*400 IU\s*2:15\sAM\s*Emily \(local\)/u)
  await theList(page)
    .getByRole("button", { name: /^Vitamin D/u })
    .click()
  const details = page.getByRole("dialog", { name: "Vitamin D" })
  await expect(details).toContainText("400 IU")
  await details.getByRole("button", { name: "Edit" }).click()
  await expect(page.getByRole("dialog", { name: "Edit dose" })).toContainText("Vitamin D · 400 IU")
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

test("lists a nap by its span among the feeds, and opens its Edit sleep sheet from its details", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [emptyDay("2026-10-08")])
  const nap = sleep("nap", local("07:10"), local("08:20"), "nap", andrew)
  played.days.push({ ...busyDay(andrew, emily), sleeps: [nap] })
  await openHistory(page, "?view=list")
  const rows = theList(page).getByRole("listitem")
  await expect(rows).toHaveCount(9)
  await expect(rows.nth(7)).toContainText(/Nap\s*1 h 10 min · Woke 8:20\sAM\s*7:10\s–\s8:20\sAM\s*Andrew \(local\)/u)
  await rows.nth(7).getByRole("button").click()
  const details = page.getByRole("dialog", { name: "Nap" })
  await expect(details).toContainText(/Fri, Oct 9, 7:10\s–\s8:20\sAM/u)
  await details.getByRole("button", { name: "Edit" }).click()
  const edit = page.getByRole("dialog", { name: "Edit sleep" })
  await expect(edit.getByLabel("Fell asleep")).toHaveValue("2026-10-09T07:10")
  await expect(edit.getByLabel("Woke")).toHaveValue("2026-10-09T08:20")
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

test("logs on an earlier day at the same clock time", async ({ page }) => {
  await playBusyDay(page)
  await playToday(page)
  await openHistory(page, "?view=list&date=2026-10-08")
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page.getByRole("dialog", { name: "Log at 9:30 AM" }).getByRole("button", { name: "Diaper" }).click()
  await expect(page.getByRole("dialog", { name: "Diaper" }).getByLabel("When")).toHaveValue("2026-10-08T09:30")
  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "Next day" }).click()
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page
    .getByRole("dialog", { name: /^Log\b/u })
    .getByRole("button", { name: "Bottle" })
    .click()
  await expect(page.getByRole("dialog", { name: "Bottle" }).getByLabel("When")).toHaveCount(0)
})

test("logs a supplement's dose at the same clock time on an earlier day, and at now on today", async ({ page }) => {
  await playBusyDay(page)
  await playToday(page)
  await openHistory(page, "?view=list&date=2026-10-08")
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page.getByRole("dialog", { name: "Log at 9:30 AM" }).getByRole("button", { name: "Vitamin D" }).click()
  await expect(page.getByRole("dialog", { name: "Vitamin D" }).getByLabel("When")).toHaveValue("2026-10-08T09:30")
  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "Next day" }).click()
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page
    .getByRole("dialog", { name: /^Log\b/u })
    .getByRole("button", { name: "Vitamin D" })
    .click()
  const sheet = page.getByRole("dialog", { name: "Vitamin D" })
  await expect(sheet.getByText("Now", { exact: true })).toBeVisible()
  await expect(sheet.getByLabel("When")).toHaveCount(0)
})

test("offers a supplement stopped since on an earlier day's menu, as it was in use then, but not at now on today", async ({
  page,
}) => {
  const { played, andrew, emily, me } = await playHistory(page, [emptyDay("2026-10-08")])
  played.days.push(busyDay(andrew, emily))
  await stopVitaminD(page, me, local("07:00"))
  await playToday(page)
  await openHistory(page, "?view=list&date=2026-10-08")
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page.getByRole("dialog", { name: "Log at 9:30 AM" }).getByRole("button", { name: "Vitamin D" }).click()
  await expect(page.getByRole("dialog", { name: "Vitamin D" }).getByLabel("When")).toHaveValue("2026-10-08T09:30")
  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "Next day" }).click()
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  const menu = page.getByRole("dialog", { name: /^Log\b/u })
  await expect(menu.getByRole("button", { name: "Diaper" })).toBeVisible()
  await expect(menu.getByRole("button", { name: "Vitamin D" })).toHaveCount(0)
})

test("logs on today as Today's buttons do: a diaper now, and a past feed from half an hour back", async ({ page }) => {
  await playBusyDay(page)
  await playToday(page)
  await openHistory(page, "?view=list")
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page
    .getByRole("dialog", { name: /^Log\b/u })
    .getByRole("button", { name: "Diaper" })
    .click()
  const diaper = page.getByRole("dialog", { name: "Diaper" })
  await expect(diaper.getByText("Now", { exact: true })).toBeVisible()
  await expect(diaper.getByLabel("When")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(diaper).toBeHidden()
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page
    .getByRole("dialog", { name: /^Log\b/u })
    .getByRole("button", { name: "Nursing" })
    .click()
  const pastFeed = page.getByRole("dialog", { name: "Past feed" })
  await expect(pastFeed.getByLabel("Started")).toHaveValue("2026-10-09T09:00")
  await pastFeed.getByRole("textbox", { name: "Left" }).fill("15")
  await expect(pastFeed.getByRole("button", { name: "Save" })).toBeEnabled()
})

test("logs a sleep on today as the Sleep sheet's Log a past sleep does: from an hour back to now", async ({ page }) => {
  await playBusyDay(page)
  await openHistory(page, "?view=list")
  await theList(page).getByRole("button", { name: "Log on this day…" }).click()
  await page
    .getByRole("dialog", { name: /^Log\b/u })
    .getByRole("button", { name: "Sleep" })
    .click()
  const pastSleep = page.getByRole("dialog", { name: "Past sleep" })
  await expect(pastSleep.getByLabel("Fell asleep")).toHaveValue("2026-10-09T08:30")
  await expect(pastSleep.getByLabel("Woke")).toHaveValue("2026-10-09T09:30")
})

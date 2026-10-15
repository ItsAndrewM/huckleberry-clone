import type { Locator, Page } from "@playwright/test"
import {
  busyDay,
  DAY,
  dayHeading,
  emptyDay,
  local,
  measurement,
  NO_TOTALS,
  openHistory,
  playHistory,
  sleep,
} from "./played-day.ts"
import { LAST_WEEK, playWeeks, THIS_WEEK, weekGrid, weekHeading, weekOf } from "./played-week.ts"
import { expect, test } from "./test.ts"

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

const columnBody = (page: Page, day: RegExp) =>
  weekGrid(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: day }) })
    .locator(".week-hours")

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

test("opens a day from the date at the head of its column too", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await expect(weekGrid(page).getByRole("link")).toHaveCount(5)
  const tuesday = await boxOf(weekGrid(page).getByText("Tue", { exact: true }))
  await page.mouse.click(tuesday.x + tuesday.width / 2, tuesday.y + tuesday.height / 2)
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(dayHeading(page)).toHaveText("Tue, Oct 6")
})

test("fits all 24 hours of the week on the screen, above the tab bar", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await expect(weekGrid(page).getByRole("link")).toHaveCount(5)
  const grid = await boxOf(weekGrid(page))
  const tabs = await boxOf(page.getByRole("navigation", { name: "Main" }))
  expect(grid.y + grid.height).toBeLessThanOrEqual(tabs.y)
  expect(await page.evaluate<number>("document.documentElement.scrollHeight - window.innerHeight")).toBeLessThanOrEqual(
    1,
  )
  const monday = await boxOf(columnBody(page, /^Mon, Oct 5/u))
  const sixPm = await boxOf(page.getByText("6 PM", { exact: true }))
  expect(sixPm.y + sixPm.height / 2 - monday.y).toBeCloseTo(0.75 * monday.height, 0)
  const friday = await boxOf(columnBody(page, /^Fri, Oct 9/u))
  const now = await boxOf(weekGrid(page).locator(".border-t-2"))
  expect(now.y - friday.y).toBeCloseTo((57 / 144) * friday.height, 0)
})

test("steps back a week and comes back to this week", async ({ page }) => {
  const { asked } = await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await page.getByRole("link", { name: "Previous week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week&date=2026-09-28$/u)
  await expect(weekHeading(page)).toHaveText(/^Sep 28\s–\sOct 4$/u)
  await expect.poll(() => asked).toContain(LAST_WEEK)
  await page.getByRole("link", { name: "Back to this week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week$/u)
  await expect(weekHeading(page)).toHaveText(/^Oct 5\s–\s11$/u)
  await expect(page.getByRole("link", { name: "Next week" })).toHaveCount(0)
})

test("keeps focus on the arrow that stepped a day or a week", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-07")
  await page.getByRole("link", { name: "Previous day" }).focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(page.getByRole("link", { name: "Previous day" })).toBeFocused()
  await openHistory(page, "?view=week")
  await page.getByRole("link", { name: "Previous week" }).focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/history\?view=week&date=2026-09-28$/u)
  await expect(page.getByRole("link", { name: "Previous week" })).toBeFocused()
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

test("says which kinds are hidden at the top while the day scrolls, and nothing once all show", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page)
  await expect(page.getByRole("region", { name: "The day by hour" })).toBeVisible()
  await expect(page.getByText(/ hidden$/u)).toHaveCount(0)
  await openHistory(page, "?hide=diapers")
  await expect(page.getByRole("region", { name: "The day by hour" })).toBeVisible()
  await page.evaluate("window.scrollTo(0, 800)")
  const chips = page.getByRole("group", { name: "Show" })
  await expect(chips).not.toBeInViewport()
  await expect(page.getByText("Diapers hidden", { exact: true })).toBeInViewport()
  await page.evaluate("window.scrollTo(0, 0)")
  await chips.getByRole("button", { name: "Diapers" }).click()
  await expect(page).toHaveURL(/\/history$/u)
  await expect(page.getByText(/ hidden$/u)).toHaveCount(0)
})

const topmostAt = (page: Page, among: string, x: number, y: number) =>
  page.evaluate<string>(`document.elementFromPoint(${x}, ${y})?.closest("${among}")?.textContent ?? "nothing"`)

test("leaves Change and Back to today their whole 44 px over the line saying what's hidden", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06&hide=diapers")
  await expect(page.getByText("Diapers hidden", { exact: true })).toBeVisible()
  const days = page.getByRole("navigation", { name: "Days" })
  const change = await boxOf(days.getByRole("button", { name: "Change" }))
  expect(await topmostAt(page, "a, button", change.x + change.width / 2, change.y + change.height - 1)).toBe("Change")
  const back = await boxOf(days.getByRole("link", { name: "Back to today" }))
  expect(await topmostAt(page, "a, button", back.x + back.width / 2, back.y + back.height - 1)).toBe("Back to today")
})

test("keeps a focused chip under the switcher once the page scrolls", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  await expect(page.getByRole("region", { name: "The day by hour" })).toBeVisible()
  const chip = page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Diapers" })
  await chip.focus()
  const nav = await boxOf(page.getByRole("navigation", { name: "Days" }))
  const title = await boxOf(dayHeading(page))
  const below = await boxOf(chip)
  const scrolled = await page.evaluate<number>("window.scrollY")
  const lift = below.y + below.height / 2 - (title.y + title.height / 2)
  await page.evaluate(`window.scrollTo(0, ${scrolled + nav.y + lift})`)
  await expect.poll(async () => (await boxOf(chip)).y).toBeLessThan(below.y - lift / 2)
  const stuck = await boxOf(dayHeading(page))
  const under = await boxOf(chip)
  expect(Math.abs(under.y + under.height / 2 - (stuck.y + stuck.height / 2))).toBeLessThan(2)
  const left = Math.max(stuck.x, under.x)
  const right = Math.min(stuck.x + stuck.width, under.x + under.width)
  expect(right - left).toBeGreaterThan(4)
  expect(await topmostAt(page, "h2, button", (left + right) / 2, stuck.y + stuck.height / 4)).toBe("Tue, Oct 6")
})

test("goes to the day or the week of a date picked under Change", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page)
  const days = page.getByRole("navigation", { name: "Days" })
  await days.getByRole("button", { name: "Change" }).click()
  const goTo = page.getByLabel("Go to")
  await expect(goTo).toBeFocused()
  await expect(goTo).toHaveAttribute("min", "2026-09-01")
  await expect(goTo).toHaveAttribute("max", DAY)
  await goTo.fill("2026-10-06")
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(page.getByLabel("Go to")).toHaveCount(0)
  await page.getByRole("group", { name: "History by" }).getByRole("button", { name: "Week" }).click()
  await page.getByRole("navigation", { name: "Weeks" }).getByRole("button", { name: "Change" }).click()
  await page.getByLabel("Go to").fill("2026-09-16")
  await expect(page).toHaveURL(/\/history\?view=week&date=2026-09-14$/u)
})

const changeIn = (page: Page, switcher: "Days" | "Weeks") =>
  page.getByRole("navigation", { name: switcher }).getByRole("button", { name: "Change" })

test("ignores a date before her birth, after today or half typed, and keeps Go to open", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page)
  await changeIn(page, "Days").click()
  const goTo = page.getByLabel("Go to")
  await goTo.fill("2026-08-31")
  await goTo.fill("2026-10-10")
  await goTo.fill("")
  await expect(goTo).toBeVisible()
  await expect(page).toHaveURL(/\/history$/u)
  await goTo.fill("2026-10-06")
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
})

test("closes Go to after a pick inside the week it already shows", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  const change = changeIn(page, "Weeks")
  await change.click()
  await page.getByLabel("Go to").fill("2026-10-07")
  await expect(page.getByLabel("Go to")).toHaveCount(0)
  await expect(change).toHaveAttribute("aria-expanded", "false")
  await expect(page).toHaveURL(/\/history\?view=week$/u)
})

test("keeps the hidden kinds when Go to opens a date", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?hide=diapers")
  await changeIn(page, "Days").click()
  await page.getByLabel("Go to").fill("2026-10-06")
  await expect(page).toHaveURL(/\/history\?date=2026-10-06&hide=diapers$/u)
})

test("starts Go to on the shown day, the week's Monday, or her birth date in her first week", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  await changeIn(page, "Days").click()
  await expect(page.getByLabel("Go to")).toHaveValue("2026-10-06")
  await openHistory(page, "?view=week")
  await changeIn(page, "Weeks").click()
  await expect(page.getByLabel("Go to")).toHaveValue("2026-10-05")
  await openHistory(page, "?view=week&date=2026-09-01")
  await changeIn(page, "Weeks").click()
  await expect(page.getByLabel("Go to")).toHaveValue("2026-09-01")
})

test("opens and closes Go to with Change, and closes it on the arrows and the Day | Week switch", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  const change = changeIn(page, "Days")
  await expect(change).toHaveAttribute("aria-expanded", "false")
  await change.click()
  await expect(change).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByLabel("Go to")).toBeVisible()
  await change.click()
  await expect(change).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByLabel("Go to")).toHaveCount(0)
  await change.click()
  await page.getByRole("link", { name: "Previous day" }).click()
  await expect(page).toHaveURL(/\/history\?date=2026-10-05$/u)
  await expect(page.getByLabel("Go to")).toHaveCount(0)
  await changeIn(page, "Days").click()
  await page.getByRole("group", { name: "History by" }).getByRole("button", { name: "Week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week$/u)
  await expect(page.getByLabel("Go to")).toHaveCount(0)
})

test("waits for a typed date, without leaving the day or closing Go to", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  await page.getByRole("navigation", { name: "Days" }).getByRole("button", { name: "Change" }).click()
  const goTo = page.getByLabel("Go to")
  await expect(goTo).toBeFocused()
  await goTo.press("ArrowDown")
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(page.getByLabel("Go to")).toBeVisible()
})

test("lands on a typed date on Enter or on leaving the field, and not before", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  const change = changeIn(page, "Days")
  await change.click()
  const typed = page.getByLabel("Go to")
  await typed.press("ArrowDown")
  await typed.fill("2026-10-05")
  await expect(typed).toBeVisible()
  await typed.press("Enter")
  await expect(page).toHaveURL(/\/history\?date=2026-10-05$/u)
  await change.click()
  const left = page.getByLabel("Go to")
  await left.press("ArrowDown")
  await left.fill("2026-10-04")
  await expect(left).toBeVisible()
  await page.getByRole("heading", { name: "History" }).click()
  await expect(page).toHaveURL(/\/history\?date=2026-10-04$/u)
})

test("commits a picked date at once, even after a key was pressed", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  await changeIn(page, "Days").click()
  const goTo = page.getByLabel("Go to")
  await goTo.press("ArrowDown")
  await goTo.click()
  await goTo.fill("2026-10-05")
  await expect(page).toHaveURL(/\/history\?date=2026-10-05$/u)
})

test("keeps Go to open when leaving it untouched, and when Enter finds nothing typed to land on", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  await changeIn(page, "Days").click()
  const goTo = page.getByLabel("Go to")
  await page.getByRole("heading", { name: "History" }).click()
  await expect(goTo).toBeVisible()
  await goTo.focus()
  await goTo.press("ArrowDown")
  await goTo.fill("")
  await goTo.press("Enter")
  await expect(goTo).toBeVisible()
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await goTo.fill("2026-10-05")
  await expect(page).toHaveURL(/\/history\?date=2026-10-05$/u)
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

const stripesIn = (page: Page, day: RegExp) =>
  weekGrid(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: day }) })
    .locator('[data-kind="sleep"]')

test("draws a night as a stripe down the left of both days' columns, says it in their names, and hides it behind the Sleep chip", async ({
  page,
}) => {
  const { played, emily } = await playHistory(page, [])
  const night = sleep("night", local("19:40", "2026-10-08"), local("06:10"), "night", emily)
  const thursday = {
    ...emptyDay("2026-10-08"),
    sleeps: [night],
    totals: { ...NO_TOTALS, sleepsStarted: 1, sleepSeconds: 15_600, nightSeconds: 15_600, longestSleepSeconds: 37_800 },
  }
  const friday = {
    ...emptyDay(DAY),
    sleeps: [night],
    totals: { ...NO_TOTALS, sleepSeconds: 22_200, nightSeconds: 22_200 },
  }
  played.days.push(thursday, friday)
  await playWeeks(page, { [THIS_WEEK]: weekOf(THIS_WEEK, [thursday, friday]) })
  await openHistory(page, "?view=week")
  const thu = weekGrid(page).getByRole("link", { name: "Thu, Oct 8: 4 h 20 min asleep, 4 h 20 min night" })
  const fri = weekGrid(page).getByRole("link", { name: "Fri, Oct 9: 6 h 10 min asleep, 6 h 10 min night" })
  await expect(thu).toBeVisible()
  await expect(fri).toBeVisible()
  await expect(stripesIn(page, /^Thu, Oct 8/u)).toHaveCount(1)
  await expect(stripesIn(page, /^Fri, Oct 9/u)).toHaveCount(1)
  await expect(weekGrid(page).getByText("Sleep", { exact: true })).toBeVisible()
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Sleep" }).click()
  await expect(weekGrid(page).getByRole("link", { name: "Fri, Oct 9: nothing shown" })).toBeVisible()
  await expect(stripesIn(page, /^Fri, Oct 9/u)).toHaveCount(0)
})

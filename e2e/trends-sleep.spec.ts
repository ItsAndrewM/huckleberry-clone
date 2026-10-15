import { datesFrom, logged, openTrends, periodOf, playTrends } from "./played-period.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const slept = (naps: number, night: number, longest: number) => ({
  sleepsStarted: 3,
  sleepSeconds: (naps + night) * 60,
  napSeconds: naps * 60,
  nightSeconds: night * 60,
  longestSleepSeconds: longest * 60,
})

const SLEPT_DAYS = {
  "2026-10-05": { ...logged(8, 52, 48, 400, 210, 8), ...slept(180, 600, 360) },
  "2026-10-06": { ...logged(7, 40, 40, 520, 0, 7), ...slept(200, 560, 300) },
}

const WEEK = periodOf(datesFrom("2026-10-05", 7), SLEPT_DAYS)
const OCTOBER = periodOf(datesFrom("2026-10-01", 31), SLEPT_DAYS)

const LONGEST_DAYS = {
  ...SLEPT_DAYS,
  "2026-10-07": { ...logged(9, 55, 61, 380, 90, 9), ...slept(190, 580, 330) },
}

const LONGEST_WEEK = periodOf(datesFrom("2026-10-05", 7), LONGEST_DAYS)
const LONGEST_OCTOBER = periodOf(datesFrom("2026-10-01", 31), LONGEST_DAYS)

test("charts sleep fifth: hours a day, naps and night, with the longest among its numbers", async ({ page }) => {
  await playTrends(page, { weeks: { "2026-W41": WEEK }, months: { "2026-10": OCTOBER } })
  await openTrends(page)
  const sleep = page.getByRole("region", { name: "Sleep" })
  await expect(sleep).toContainText("12 h 50 min a day, over 2 days")
  await expect(sleep).toContainText(/Naps 3 h 10 min\s·\sNight 9 h 40 min\s·\sLongest 5 h 30 min/u)
  await expect(sleep.getByRole("img")).toHaveAccessibleName("Sleep each day, in hours")
})

test("fits the table's five columns on a phone without scrolling the page sideways", async ({ page }) => {
  await playTrends(page, { weeks: { "2026-W41": WEEK }, months: { "2026-10": OCTOBER } })
  await openTrends(page)
  await page.getByText("Show as a table", { exact: true }).click()
  await expect(
    page
      .getByRole("table")
      .getByRole("row", { name: /Mon, Oct 5/u })
      .getByRole("cell"),
  ).toHaveText(["8", "1 h 40 min", "610 mL", "8", "13 h"])
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true)
})

for (const [width, volume, unit] of [
  [360, "ml", "mL"],
  [360, "fl_oz", "fl oz"],
  [393, "fl_oz", "fl oz"],
] as const) {
  test(`fits the table on a ${width}-pixel-wide phone in ${unit}, a day's 12 h 50 min of sleep wrapping between its parts`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 659 })
    await playTrends(page, { weeks: { "2026-W41": LONGEST_WEEK }, months: { "2026-10": LONGEST_OCTOBER } }, volume)
    await openTrends(page)
    await page.getByText("Show as a table", { exact: true }).click()
    const wednesday = page.getByRole("table").getByRole("row", { name: /Wed, Oct 7/u })
    await expect(wednesday.getByRole("cell").last()).toHaveText("12 h 50 min")
    await expect(wednesday).toContainText(unit)
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true)
  })
}

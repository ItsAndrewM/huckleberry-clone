import type { Locator } from "@playwright/test"
import { busyDay, DAY, diaper, emptyDay, feed, local, NOW, openHistory, playHistory } from "./played-day.ts"
import { expect, test } from "./test.ts"

const HOUR_LABEL = /^\d{1,2}\s[AP]M$/u
const YESTERDAY = "2026-10-08"

type Box = Awaited<ReturnType<Locator["boundingBox"]>>

interface Point {
  readonly x: number
  readonly y: number
}

const middleOf = (box: Box): Point => ({
  x: (box?.x ?? Number.NaN) + (box?.width ?? Number.NaN) / 2,
  y: (box?.y ?? Number.NaN) + (box?.height ?? Number.NaN) / 2,
})

const covers = (box: Box, { x, y }: Point) =>
  box !== null && box.x < x && x < box.x + box.width && box.y < y && y < box.y + box.height

test("draws each nursing feed as a block, and bottles and diapers as markers by the hour", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  const grid = page.getByRole("region", { name: "The day by hour" })
  await expect(grid.getByText("Nursing 14m L · 9m R")).toBeVisible()
  await expect(grid.getByRole("button", { name: "Nursing at 1:05 AM: Left 14 min, Right 9 min" })).toBeVisible()
  await expect(
    grid.getByRole("button", { name: "Nursing and bottle at 3:00 AM: Left 10 min, Right 10 min, 60 mL" }),
  ).toBeVisible()
  await expect(grid.getByRole("button", { name: "2 entries from 2:10 AM" })).toHaveText("2 entries")
  await expect(grid.getByRole("button", { name: "Bottle at 4:00 AM: 90 mL" })).toHaveText("90 mL")
  await expect(grid.getByRole("button", { name: "Diaper at 5:30 AM: Pee and poo" })).toHaveText("Both")
})

test("draws the part of yesterday's feed after midnight, and a feed still going up to now", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  const grid = page.getByRole("region", { name: "The day by hour" })
  await expect(grid.getByRole("button", { name: /^Nursing at 11:40 PM: Left 35 min$/u })).toBeVisible()
  await expect(grid.getByRole("button", { name: "Nursing at 9:10 AM: in progress, Left 20 min" })).toHaveText(
    "Nursing 20m L · now",
  )
})

test("opens today scrolled to the hour now falls in", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  const grid = page.getByRole("region", { name: "The day by hour" })
  await expect(grid.getByRole("button", { name: "Log at 9 AM", exact: true })).toBeInViewport()
})

test("opens an earlier day scrolled to its first entry", async ({ page }) => {
  const { played, emily } = await playHistory(page, [])
  played.days.push({
    ...emptyDay(YESTERDAY),
    diapers: [diaper("evening", local("20:00", YESTERDAY), true, false, emily)],
  })
  await openHistory(page, `?date=${YESTERDAY}`)
  await expect(page.getByRole("button", { name: "Diaper at 8:00 PM: Pee" })).toBeInViewport()
})

test("grows a running feed's block as time passes", async ({ page }) => {
  const { played, emily } = await playHistory(page, [])
  played.days.push({
    ...emptyDay(DAY),
    feeds: [feed("running", emily, [{ side: "left", from: local("09:10"), to: null }])],
  })
  await page.clock.install({ time: NOW })
  await page.goto("/history")
  const block = page.getByRole("button", { name: /^Nursing at 9:10 AM: in progress/u })
  await expect(block).toHaveText("Nursing 20m L · now")
  const before = await block.boundingBox()
  await page.clock.fastForward("30:00")
  await expect(block).toHaveText("Nursing 50m L · now")
  const after = await block.boundingBox()
  expect((after?.height ?? 0) - (before?.height ?? 0)).toBeCloseTo(30, 0)
})

test("draws a row for every real hour: 25 on the night the clocks go back, with two 1 AMs", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-11-01", 25)], "America/Los_Angeles")
  await page.clock.setFixedTime(local("12:00", "2026-11-02", "-08:00"))
  await page.goto("/history?date=2026-11-01")
  const grid = page.getByRole("region", { name: "The day by hour" })
  await expect(grid.getByText(HOUR_LABEL)).toHaveCount(25)
  await expect(grid.getByText("1 AM", { exact: true })).toHaveCount(2)
})

test("skips the hour the clocks go forward over", async ({ page }) => {
  await playHistory(page, [emptyDay("2027-03-14", 23, "-08:00")], "America/Los_Angeles")
  await page.clock.setFixedTime(local("12:00", "2027-03-15"))
  await page.goto("/history?date=2027-03-14")
  const grid = page.getByRole("region", { name: "The day by hour" })
  await expect(grid.getByText(HOUR_LABEL)).toHaveCount(23)
  await expect(grid.getByText("2 AM", { exact: true })).toHaveCount(0)
})

test("keeps the grid under the tab bar, so a tab with a block scrolled behind it still takes the tap", async ({
  page,
}) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  const block = page.getByRole("button", { name: /^Nursing at 9:10 AM: in progress/u })
  const trends = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Trends" })
  await expect(block).toBeVisible()
  const tab = middleOf(await trends.boundingBox())
  await page.evaluate(`window.scrollBy(0, ${middleOf(await block.boundingBox()).y - tab.y})`)
  expect(covers(await block.boundingBox(), tab)).toBe(true)
  await trends.click()
  await expect(page).toHaveURL(/\/trends$/u)
})

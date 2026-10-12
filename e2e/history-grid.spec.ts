import { expect, test } from "@playwright/test"
import { busyDay, DAY, emptyDay, feed, local, NOW, openHistory, playHistory } from "./played-day.ts"

const HOUR_LABEL = /^\d{1,2} [AP]M$/u

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
    "Nursing 20m L",
  )
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
  await expect(block).toHaveText("Nursing 20m L")
  const before = await block.boundingBox()
  await page.clock.fastForward("30:00")
  await expect(block).toHaveText("Nursing 50m L")
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

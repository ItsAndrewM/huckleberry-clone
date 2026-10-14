import { expect, type Page, test } from "@playwright/test"
import { DAY, diaper, emptyDay, local, NO_TOTALS, openHistory, playHistory } from "./played-day.ts"

const HOUR_PX = 60
const BOTTLE_WAITS = "Bottle opens once Today loads."

const OPENS_WITHOUT_TODAY = [
  { choice: "Nursing", sheet: "Past feed", field: "Started" },
  { choice: "Diaper", sheet: "Diaper", field: "When" },
  { choice: "Sleep", sheet: "Past sleep", field: "Fell asleep" },
  { choice: "Measurement", sheet: "Add measurement", field: "When" },
]

test.use({ timezoneId: "Europe/London" })

const tapHour = (page: Page, hour: string, minute: number) =>
  page
    .getByRole("region", { name: "The day by hour" })
    .getByRole("button", { name: `Log at ${hour}`, exact: true })
    .click({ position: { x: 200, y: (minute / 60) * HOUR_PX + 1 } })

const playToday = (page: Page) =>
  page.route("**/api/today", (route) =>
    route.fulfill({
      json: {
        date: DAY,
        totals: NO_TOTALS,
        activeFeed: null,
        lastFeed: null,
        activeSleep: null,
        lastSleep: null,
        prefill: { lastBottle: { breastMilkMl: 0, formulaMl: 90 }, lastSide: null },
        recent: [],
      },
    }),
  )

test("logs a diaper at the quarter hour tapped, and draws it once the household has it", async ({ page }) => {
  const { played, andrew } = await playHistory(page, [emptyDay(DAY)])
  const sent: number[] = []
  await page.route("**/api/diapers", async (route) => {
    const body = route.request().postDataJSON()
    sent.push(body.occurredAt)
    const saved = diaper(`diaper-${body.actionId}`, body.occurredAt, body.wet, body.dirty, andrew)
    played.days.splice(0, 1, { ...emptyDay(DAY), diapers: [saved] })
    await route.fulfill({ status: 201, json: { diaper: saved, changed: [["today"], ["day", DAY]] } })
  })
  await openHistory(page)
  await tapHour(page, "6 AM", 22)
  await page.getByRole("dialog", { name: "Log at 6:15 AM" }).getByRole("button", { name: "Diaper" }).click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await expect(sheet.getByLabel("When")).toHaveValue("2026-10-09T06:15")
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect.poll(() => sent).toEqual([local("06:15")])
  await expect(page.getByRole("button", { name: "Diaper at 6:15 AM: Pee" })).toBeVisible()
})

test("opens Nursing at the slot as a past feed, and Bottle there too", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await playToday(page)
  await openHistory(page)
  await tapHour(page, "2 AM", 20)
  await page.getByRole("dialog", { name: "Log at 2:15 AM" }).getByRole("button", { name: "Nursing" }).click()
  const pastFeed = page.getByRole("dialog", { name: "Past feed" })
  await expect(pastFeed.getByLabel("Started")).toHaveValue("2026-10-09T02:15")
  await page.keyboard.press("Escape")
  await expect(pastFeed).toBeHidden()
  await tapHour(page, "4 AM", 50)
  const menu = page.getByRole("dialog", { name: "Log at 4:45 AM" })
  await expect(menu.getByText(BOTTLE_WAITS)).toBeHidden()
  await menu.getByRole("button", { name: "Bottle" }).click()
  await expect(page.getByRole("dialog", { name: "Bottle" }).getByLabel("When")).toHaveValue("2026-10-09T04:45")
})

test("keeps Bottle waiting while Today can't be loaded, and says why, while the other four open at the slot", async ({
  page,
}) => {
  await playHistory(page, [emptyDay(DAY)])
  await page.route("**/api/today", (route) => route.fulfill({ status: 404 }))
  await openHistory(page)
  await tapHour(page, "2 AM", 20)
  const menu = page.getByRole("dialog", { name: "Log at 2:15 AM" })
  await expect(menu.getByText(BOTTLE_WAITS)).toBeVisible()
  const bottle = menu.getByRole("button", { name: "Bottle" })
  await expect(bottle).toBeDisabled()
  await expect(bottle).toHaveAccessibleDescription(BOTTLE_WAITS)
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
  for (const { choice, sheet, field } of OPENS_WITHOUT_TODAY) {
    await tapHour(page, "2 AM", 20)
    await menu.getByRole("button", { name: choice }).click()
    const opened = page.getByRole("dialog", { name: sheet })
    await expect(opened.getByLabel(field)).toHaveValue("2026-10-09T02:15")
    await page.keyboard.press("Escape")
    await expect(opened).toBeHidden()
  }
})

test("opens Measurement at the slot", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await openHistory(page)
  await tapHour(page, "3 AM", 40)
  await page.getByRole("dialog", { name: "Log at 3:30 AM" }).getByRole("button", { name: "Measurement" }).click()
  await expect(page.getByRole("dialog", { name: "Add measurement" }).getByLabel("When")).toHaveValue("2026-10-09T03:30")
})

test("starts the quick actions on Today at Now again after History opened a sheet at a slot", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await playToday(page)
  await openHistory(page)
  await tapHour(page, "2 AM", 20)
  await page.getByRole("dialog", { name: "Log at 2:15 AM" }).getByRole("button", { name: "Diaper" }).click()
  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "Today", exact: true }).click()
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Diaper" }).click()
  await expect(page.getByRole("dialog", { name: "Diaper" }).getByText("Now", { exact: true })).toBeVisible()
})

test("does nothing for a tap after now, and leaves later hours closed", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await openHistory(page)
  await tapHour(page, "9 AM", 45)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Log at 10 AM", exact: true })).toBeDisabled()
  await tapHour(page, "9 AM", 20)
  await expect(page.getByRole("dialog", { name: "Log at 9:15 AM" })).toBeVisible()
})

test("asks for both 1 AMs by name on the night the clocks go back", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-11-01", 25)], "America/Los_Angeles")
  await page.clock.setFixedTime(local("12:00", "2026-11-02", "-08:00"))
  await page.goto("/history?date=2026-11-01")
  const grid = page.getByRole("region", { name: "The day by hour" })
  await expect(grid.getByRole("button", { name: /^Log at / })).toHaveCount(25)
  await grid.getByRole("button", { name: "Log at 1 AM (second)" }).click({ position: { x: 200, y: 31 } })
  const menu = page.getByRole("dialog", { name: /^Log at 1:30\sAM$/u })
  await expect(menu).toBeVisible()
  await menu.getByRole("button", { name: "Diaper" }).click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await expect(sheet.getByRole("button", { name: /^1:30\sAM \(second\)$/u })).toHaveAttribute("aria-pressed", "true")
  await expect(sheet.getByRole("button", { name: /^1:30\sAM \(first\)$/u })).toHaveAttribute("aria-pressed", "false")
})

test("logs at the hour's start from the keyboard", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await openHistory(page)
  await page.getByRole("button", { name: "Log at 2 AM", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("dialog", { name: "Log at 2:00 AM" })).toBeVisible()
})

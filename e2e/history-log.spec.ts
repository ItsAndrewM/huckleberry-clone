import type { Locator, Page } from "@playwright/test"
import {
  DAY,
  diaper,
  dose,
  emptyDay,
  local,
  NO_TOTALS,
  NOW,
  openHistory,
  playHistory,
  stopVitaminD,
} from "./played-day.ts"
import { gate } from "./played-household.ts"
import { expect, test } from "./test.ts"

const HOUR_PX = 60
const BOTTLE_WAITS = "Bottle opens once Today loads."

const OPENS_WITHOUT_TODAY = [
  { choice: "Nursing", sheet: "Past feed", field: "Started" },
  { choice: "Diaper", sheet: "Diaper", field: "When" },
  { choice: "Sleep", sheet: "Past sleep", field: "Fell asleep" },
  { choice: "Measurement", sheet: "Add measurement", field: "When" },
  { choice: "Vitamin D", sheet: "Vitamin D", field: "When" },
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
        doses: [],
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

test("keeps Bottle waiting while Today can't be loaded, and says why, while the rest open at the slot", async ({
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

test("opens a supplement's dose sheet at the slot, and logs the dose there", async ({ page }) => {
  const me = await (await page.request.get("/api/me")).json()
  const vitaminD = me.household.supplements.find(({ name }: { name: string }) => name === "Vitamin D")
  const { played, andrew } = await playHistory(page, [emptyDay(DAY)])
  const sent: Array<{ supplementId: string; occurredAt: number }> = []
  await page.route("**/api/doses", async (route) => {
    const body = route.request().postDataJSON()
    sent.push({ supplementId: body.supplementId, occurredAt: body.occurredAt })
    const saved = dose(`dose-${body.actionId}`, body.supplementId, body.occurredAt, andrew)
    played.days.splice(0, 1, { ...emptyDay(DAY), doses: [saved] })
    await route.fulfill({ status: 201, json: { dose: saved, changed: [["today"], ["day", DAY]] } })
  })
  await openHistory(page)
  await tapHour(page, "7 AM", 40)
  await page.getByRole("dialog", { name: "Log at 7:30 AM" }).getByRole("button", { name: "Vitamin D" }).click()
  const sheet = page.getByRole("dialog", { name: "Vitamin D" })
  await expect(sheet.getByLabel("When")).toHaveValue("2026-10-09T07:30")
  await sheet.getByRole("button", { name: "Log Vitamin D" }).click()
  await expect.poll(() => sent).toEqual([{ supplementId: vitaminD.id, occurredAt: local("07:30") }])
  await expect(page.getByRole("button", { name: /^Vitamin D at 7:30\sAM: 400 IU$/u })).toBeVisible()
})

test("offers a supplement stopped at 8:00 at a slot before it, and leaves it out of one after", async ({ page }) => {
  const { me } = await playHistory(page, [emptyDay(DAY)])
  await stopVitaminD(page, me, local("08:00"))
  await openHistory(page)
  await tapHour(page, "7 AM", 40)
  const before = page.getByRole("dialog", { name: "Log at 7:30 AM" })
  await expect(before.getByRole("button", { name: "Vitamin D" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await tapHour(page, "8 AM", 50)
  const after = page.getByRole("dialog", { name: "Log at 8:45 AM" })
  await expect(after.getByRole("button", { name: "Diaper" })).toBeVisible()
  await expect(after.getByRole("button", { name: "Vitamin D" })).toHaveCount(0)
})

const recordUntilItLeaves = (sheet: Locator) =>
  sheet.evaluateHandle((dialog) => {
    const seen: Array<{ readonly title: string; readonly choices: ReadonlyArray<string> }> = []
    const textOf = (element: { readonly textContent: string | null } | null) =>
      element?.textContent?.replace(/\s+/gu, " ") ?? ""
    const observer = new dialog.ownerDocument.defaultView.MutationObserver(() => {
      if (!dialog.isConnected) {
        observer.disconnect()
        return
      }
      seen.push({
        title: textOf(dialog.querySelector('[data-slot="drawer-title"]')),
        choices: [...dialog.querySelectorAll("button")].map(textOf),
      })
    })
    observer.observe(dialog.ownerDocument.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
    return seen
  })

test("keeps the slot's time in its title, and a supplement stopped after the slot, while it slides away", async ({
  page,
}) => {
  const { me } = await playHistory(page, [emptyDay(DAY)])
  await stopVitaminD(page, me, local("08:00"))
  await openHistory(page)
  await tapHour(page, "7 AM", 40)
  const menu = page.getByRole("dialog", { name: "Log at 7:30 AM" })
  await expect(menu.getByRole("button", { name: "Vitamin D" })).toBeVisible()
  const seen = await recordUntilItLeaves(menu)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const sliding = await seen.jsonValue()
  expect(sliding.length).toBeGreaterThan(0)
  expect(sliding.map(({ title }) => title).filter((title) => title !== "Log at 7:30 AM")).toEqual([])
  expect(sliding.filter(({ choices }) => !choices.includes("Vitamin D"))).toEqual([])
})

test("keeps the slot's time in its title while it slides away for a failed diaper's sheet, which opens in its place", async ({
  page,
}) => {
  await playHistory(page, [emptyDay(DAY)])
  const lost = gate()
  await page.route("**/api/diapers", async (route) => {
    await lost.opened
    await route.abort("internetdisconnected")
  })
  await openHistory(page)
  await tapHour(page, "7 AM", 40)
  await page.getByRole("dialog", { name: "Log at 7:30 AM" }).getByRole("button", { name: "Diaper" }).click()
  const diaper = page.getByRole("dialog", { name: "Diaper" })
  await diaper.getByRole("button", { name: "Pee" }).click()
  await expect(diaper).toBeHidden()
  await tapHour(page, "8 AM", 20)
  const menu = page.getByRole("dialog", { name: "Log at 8:15 AM" })
  await expect(menu.getByRole("button", { name: "Diaper" })).toBeVisible()
  lost.open()
  await expect.poll(() => page.evaluate(() => localStorage.getItem("bt.kept"))).toContain('"failed":true')
  const seen = await recordUntilItLeaves(menu)
  await page.keyboard.press("Escape")
  await expect(diaper.getByRole("alert")).toContainText("No connection")
  await expect(menu).toHaveCount(0)
  const sliding = await seen.jsonValue()
  expect(sliding.length).toBeGreaterThan(0)
  expect(sliding.map(({ title }) => title).filter((title) => title !== "Log at 8:15 AM")).toEqual([])
})

const supplementNamed = (id: string, name: string) => ({
  id,
  name,
  dose: "1 mL",
  stoppedAt: null,
  version: 1,
  createdBy: null,
  createdAt: NOW,
  updatedBy: null,
  updatedAt: NOW,
})

const SHARING_A_PREFIX = ["Multivitamin drops", "Multivitamin syrup"]
const UNBROKEN = "Multivitamin".repeat(5)

const overflowOf = (button: Locator) =>
  button.evaluate((element) => {
    const px = (overflow: number) => Math.max(0, Math.round(overflow))
    const label = element.querySelector("span")
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(label)
    const text = range.getBoundingClientRect()
    const shown = label.getBoundingClientRect()
    const edge = element.getBoundingClientRect()
    return {
      text: { right: px(text.right - shown.right), bottom: px(text.bottom - shown.bottom) },
      label: {
        left: px(edge.left - shown.left),
        right: px(shown.right - edge.right),
        top: px(edge.top - shown.top),
        bottom: px(shown.bottom - edge.bottom),
      },
    }
  })

test("shows a long supplement name in full over two lines on a 360-pixel-wide phone, and wraps an unbroken one inside its button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 })
  const { me } = await playHistory(page, [emptyDay(DAY)])
  const added = [...SHARING_A_PREFIX, UNBROKEN].map((name, index) => supplementNamed(`supplement-${index}`, name))
  const household = { ...me.household, supplements: [...me.household.supplements, ...added] }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household } }))
  await openHistory(page)
  await tapHour(page, "7 AM", 40)
  const menu = page.getByRole("dialog", { name: "Log at 7:30 AM" })
  const buttonFor = (name: string) => menu.getByRole("button", { name, exact: true })
  for (const name of SHARING_A_PREFIX) {
    expect(await overflowOf(buttonFor(name))).toEqual({
      text: { right: 0, bottom: 0 },
      label: { left: 0, right: 0, top: 0, bottom: 0 },
    })
  }
  const unbroken = await overflowOf(buttonFor(UNBROKEN))
  expect(unbroken.text.right).toBe(0)
  expect(unbroken.label).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
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
  const menu = page.getByRole("dialog", { name: /^Log at 1:30\sAM on Sun, Nov 1$/u })
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

import type { Page } from "@playwright/test"
import { busyDay, DAY, diaper, emptyDay, feed, local, openHistory, playHistory } from "./played-day.ts"
import { gate, holdRequests } from "./played-household.ts"
import { expect, test } from "./test.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)

test("edits a diaper from its details, and the grid shows it before the household answers", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  const day = busyDay(andrew, emily)
  played.days.push(day)
  const sent: unknown[] = []
  const answered = gate()
  await page.route("**/api/diapers/both", async (route) => {
    sent.push(route.request().postDataJSON())
    const both = day.diapers.find(({ id }) => id === "both")
    await route.fulfill({ json: { diaper: { ...both, dirty: false, version: 2 }, changed: [] } })
  })
  await holdRequests(page, "**/api/diapers/both", () => answered.opened)
  await openHistory(page)
  await page.getByRole("button", { name: "Diaper at 5:30 AM: Both, pee and poo" }).click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Edit" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Pee" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole("button", { name: "Diaper at 5:30 AM: Pee", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Diaper at 5:30 AM: Both, pee and poo" })).toHaveCount(0)
  answered.open()
  await expect
    .poll(() => sent)
    .toEqual([{ actionId: ACTION_ID, version: 1, occurredAt: day.diapers[2]?.occurredAt, wet: true, dirty: false }])
})

test("gives each entry gathered in one marker its own Edit", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  await page.getByRole("button", { name: "2 entries from 2:10 AM" }).click()
  const details = page.getByRole("dialog", { name: "2 entries" })
  await details.getByRole("button", { name: "Edit Diaper at 2:20 AM: Poo" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await expect(sheet.getByRole("button", { name: "Poo" })).toHaveAttribute("aria-pressed", "true")
  await expect(sheet.getByLabel("When")).toHaveValue("2026-10-09T02:20")
})

const playPausedFeedFromTheEveningBefore = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [])
  const sides = [{ side: "left" as const, from: local("23:40", "2026-10-08"), to: local("23:55", "2026-10-08") }]
  const paused = { ...feed("paused", andrew, sides, [[local("00:00"), 60, 0]]), status: "active", endedAt: null }
  played.days.push({ ...emptyDay(DAY), feeds: [paused], diapers: [diaper("pee", local("00:10"), true, false, emily)] })
  await openHistory(page)
}

test("opens the Nursing sheet, not the edit sheet, for a paused feed gathered into a marker", async ({ page }) => {
  await playPausedFeedFromTheEveningBefore(page)
  await page.getByRole("button", { name: /^2 entries from/u }).click()
  await page
    .getByRole("dialog", { name: "2 entries" })
    .getByRole("button", { name: /^Edit Nursing/u })
    .click()
  await expect(page.getByRole("dialog", { name: "Nursing" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /^Edit/u })).toHaveCount(0)
})

test("says the weekday of the evening before on a marker gathering an entry from it", async ({ page }) => {
  await playPausedFeedFromTheEveningBefore(page)
  await expect(page.getByRole("button", { name: /^2 entries from Thu 11:40\sPM$/u })).toBeVisible()
})

test("says the weekday of the evening before on the Edit of an entry from it, and not on the day's own", async ({
  page,
}) => {
  await playPausedFeedFromTheEveningBefore(page)
  await page.getByRole("button", { name: /^2 entries from/u }).click()
  const details = page.getByRole("dialog", { name: "2 entries" })
  await expect(details.getByRole("button", { name: /^Edit Nursing and bottle at Thu 11:40\sPM: /u })).toBeVisible()
  await expect(details.getByRole("button", { name: /^Edit Diaper at 12:10\sAM: Pee$/u })).toBeVisible()
})

test("edits a feed from its details in one Save", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  const sent: unknown[] = []
  await page.route("**/api/feeds/nursed", (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } })
  })
  await openHistory(page)
  await page.getByRole("button", { name: /^Nursing at 1:05 AM/u }).click()
  await page.getByRole("dialog", { name: "Nursing" }).getByRole("button", { name: "Edit" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit feed" })
  await sheet.getByRole("group", { name: "Side 1" }).getByLabel("Minutes").fill("10")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Not saved.")
  await expect.poll(() => sent).toHaveLength(1)
  await expect(sheet.getByRole("group", { name: "Side 1" }).getByLabel("Minutes")).toHaveValue("10")
})

test("reopens a failed edit's sheet as soon as the day changes under another entry's details", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [emptyDay("2026-10-08")])
  played.days.push(busyDay(andrew, emily))
  const failing = gate()
  await page.route("**/api/diapers/both", async (route) => {
    await failing.opened
    await route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } })
  })
  await openHistory(page, "?date=2026-10-08")
  await page.getByRole("link", { name: "Next day" }).click()
  await page.getByRole("button", { name: "Diaper at 5:30 AM: Both, pee and poo" }).click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Edit" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Pee" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole("button", { name: /^Nursing at 1:05 AM/u }).click()
  await expect(page.getByRole("dialog", { name: "Nursing" })).toBeVisible()
  failing.open()
  await expect(page.getByRole("dialog", { name: "Nursing" })).toBeVisible()
  await page.goBack()
  await expect(sheet.getByRole("alert")).toContainText("Not saved.")
  await expect(sheet.getByRole("button", { name: "Pee", exact: true })).toHaveAttribute("aria-pressed", "true")
})

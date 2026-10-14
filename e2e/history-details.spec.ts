import { expect, test } from "@playwright/test"
import { busyDay, dayHeading, diaper, emptyDay, local, openHistory, playHistory } from "./played-day.ts"

test("opens a feed's details: its times, sides, pause and bottle, and who logged it", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  await page.getByRole("button", { name: /^Nursing and bottle at 3:00 AM/u }).click()
  const sheet = page.getByRole("dialog", { name: "Nursing and bottle" })
  await expect(sheet).toContainText(/Fri, Oct 9, 3:00\s–\s3:45\sAM/u)
  await expect(sheet).toContainText("Left 10 min · Right 10 min")
  await expect(sheet).toContainText("Paused 20 min")
  await expect(sheet).toContainText("Bottle 60 mL breast milk")
  await expect(sheet).toContainText("Logged by Emily (local)")
  await sheet.getByRole("button", { name: "Close" }).click()
  await expect(sheet).toBeHidden()
})

test("lists every entry gathered in one marker", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  await page.getByRole("button", { name: "2 entries from 2:10 AM" }).click()
  const sheet = page.getByRole("dialog", { name: "2 entries" })
  await expect(sheet.getByRole("listitem")).toHaveCount(2)
  await expect(sheet.getByRole("listitem").first()).toContainText("Pee")
  await expect(sheet.getByRole("listitem").first()).toContainText("Logged by Emily (local)")
  await expect(sheet.getByRole("listitem").last()).toContainText("Poo")
})

test("opens the Nursing sheet for a feed that's still going, as Today does", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  const day = busyDay(andrew, emily)
  played.days.push(day)
  const running = day.feeds.find(({ id }) => id === "running")
  await page.route("**/api/today", (route) =>
    route.fulfill({
      json: {
        date: day.date,
        totals: day.totals,
        activeFeed: running,
        lastFeed: running,
        activeSleep: null,
        lastSleep: null,
        prefill: { lastBottle: null, lastSide: "left" },
        recent: [],
        doses: [],
      },
    }),
  )
  await openHistory(page)
  await page.getByRole("button", { name: /^Nursing at 9:10 AM: in progress/u }).click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await expect(sheet.getByRole("button", { name: "Pause" })).toBeVisible()
})

test("closes an entry's details when the day changes under them, rather than calling the entry deleted", async ({
  page,
}) => {
  const { played, emily } = await playHistory(page, [emptyDay("2026-10-08")])
  played.days.push({
    ...emptyDay("2026-10-07"),
    diapers: [diaper("early", local("08:00", "2026-10-07"), true, false, emily)],
  })
  await openHistory(page, "?date=2026-10-08")
  await page.getByRole("link", { name: "Previous day" }).click()
  await expect(dayHeading(page)).toHaveText("Wed, Oct 7")
  await page.getByRole("button", { name: "Diaper at 8:00 AM: Pee" }).click()
  await expect(page.getByRole("dialog", { name: "Diaper" })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/history\?date=2026-10-08$/u)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByText("This entry was deleted.")).toHaveCount(0)
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
})

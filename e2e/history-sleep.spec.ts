import { expect, type Page, test } from "@playwright/test"
import { busyDay, local, openHistory, playHistory, sleep } from "./played-day.ts"
import { muteLiveUpdates } from "./played-household.ts"

const grid = (page: Page) => page.getByRole("region", { name: "The day by hour" })

const boxOf = async (page: Page, name: RegExp) => {
  const box = await grid(page).getByRole("button", { name }).boundingBox()
  if (box === null) throw new Error(`No box for ${name.source}`)
  return box
}

const playSleptDay = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push({
    ...busyDay(andrew, emily),
    sleeps: [
      sleep("night", local("20:30", "2026-10-08"), local("05:00"), "night", emily),
      sleep("nap", local("07:10"), local("08:20"), "nap", andrew),
    ],
  })
  await muteLiveUpdates(page)
  return played
}

test("draws each sleep in its own column beside the hours, the feeds it overlaps keeping their width", async ({
  page,
}) => {
  await playSleptDay(page)
  await openHistory(page)
  const night = await boxOf(page, /^Night at 8:30\sPM/u)
  const feed = await boxOf(page, /^Nursing at 1:05\sAM/u)
  expect(night.x + night.width).toBeLessThanOrEqual(feed.x)
  expect(feed.width).toBeGreaterThan(120)
  expect(night.y).toBeLessThan(feed.y)
})

test("opens a sleep's details, and its edit sheet from them", async ({ page }) => {
  await playSleptDay(page)
  await openHistory(page)
  await grid(page)
    .getByRole("button", { name: /^Nap at 7:10\sAM/u })
    .click()
  const details = page.getByRole("dialog", { name: "Nap" })
  await expect(details).toContainText(/Fri, Oct 9, 7:10\s–\s8:20\sAM/u)
  await expect(details).toContainText("1 h 10 min")
  await expect(details).toContainText("Logged by Andrew (local)")
  await details.getByRole("button", { name: "Edit" }).click()
  const edit = page.getByRole("dialog", { name: "Edit sleep" })
  await expect(edit.getByLabel("Fell asleep")).toHaveValue("2026-10-09T07:10")
  await expect(edit.getByLabel("Woke")).toHaveValue("2026-10-09T08:20")
})

test("hides the sleeps behind the Sleep chip, and says so", async ({ page }) => {
  await playSleptDay(page)
  await openHistory(page)
  await expect(grid(page).getByRole("button", { name: /^Nap at/u })).toBeVisible()
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Sleep" }).click()
  await expect(grid(page).getByRole("button", { name: /^Nap at/u })).toHaveCount(0)
  await expect(page.getByText("Sleep hidden")).toBeVisible()
  await expect(page).toHaveURL(/hide=sleep/u)
})

test("fits all four chips on a 360-pixel-wide phone, without scrolling the page sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await playSleptDay(page)
  await openHistory(page)
  await expect(page.getByRole("group", { name: "Show" }).getByRole("button")).toHaveText([
    "Feeds",
    "Diapers",
    "Sleep",
    "Growth",
  ])
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true)
})

import type { Page } from "@playwright/test"
import { busyDay, type DayAnswer, local, openHistory, playHistory, sleep } from "./played-day.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "Europe/London" })

const grid = (page: Page) => page.getByRole("region", { name: "The day by hour" })

const boxOf = async (page: Page, name: RegExp) => {
  const box = await grid(page).getByRole("button", { name }).boundingBox()
  if (box === null) throw new Error(`No box for ${name.source}`)
  return box
}

const chipTops = async (page: Page) => {
  const chips = await page.getByRole("group", { name: "Show" }).getByRole("button").all()
  return Promise.all(
    chips.map(async (chip) => {
      const box = await chip.boundingBox()
      if (box === null) throw new Error("A chip has no box")
      return box.y
    }),
  )
}

const playSleeps = async (page: Page, sleepsOf: (andrew: string, emily: string) => DayAnswer["sleeps"]) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push({ ...busyDay(andrew, emily), sleeps: sleepsOf(andrew, emily) })
  return played
}

const playSleptDay = (page: Page) =>
  playSleeps(page, (andrew, emily) => [
    sleep("night", local("20:30", "2026-10-08"), local("05:00"), "night", emily),
    sleep("nap", local("07:10"), local("08:20"), "nap", andrew),
  ])

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

test("fits the five chips on a 360-pixel-wide phone in two rows, Sleep on the first, without scrolling the page sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await playSleptDay(page)
  await openHistory(page)
  await expect(page.getByRole("group", { name: "Show" }).getByRole("button")).toHaveText([
    "Feeds",
    "Diapers",
    "Sleep",
    "Growth",
    "Supplements",
  ])
  await expect(grid(page)).toBeVisible()
  const tops = await chipTops(page)
  expect(new Set(tops.slice(0, 4)).size, `the chips' tops are ${tops.join(", ")}`).toBe(1)
  expect(new Set(tops).size, `the chips' tops are ${tops.join(", ")}`).toBe(2)
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true)
})

test("keeps a 10-hour night's length whole, and a 25-minute nap's name clear of a sliced length, on a 360-pixel-wide phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await playSleeps(page, (andrew, emily) => [
    sleep("night", local("19:30", "2026-10-08"), local("06:00"), "night", emily),
    sleep("catnap", local("07:10"), local("07:35"), "nap", andrew),
  ])
  await openHistory(page)
  const length = grid(page)
    .getByRole("button", { name: /^Night at 7:30\sPM/u })
    .getByText("10h30", { exact: true })
  await expect(length).toBeVisible()
  const { needs, has } = await length.evaluate((element) => ({ needs: element.scrollWidth, has: element.clientWidth }))
  expect(needs, `"10h30" needs ${needs} px of its ${has} px line`).toBeLessThanOrEqual(has)
  const nap = grid(page).getByRole("button", { name: /^Nap at 7:10\sAM/u })
  await expect(nap).toHaveText("Nap")
  await expect(nap).toHaveAccessibleName(/^Nap at 7:10\sAM: 25 min, Woke 7:35\sAM$/u)
})

import { expect, type Page, test } from "@playwright/test"
import { DAY, dose, emptyDay, local, openHistory, playHistory } from "./played-day.ts"
import { playWeeks, THIS_WEEK, weekGrid, weekOf } from "./played-week.ts"

test.use({ timezoneId: "Europe/London" })

const playDosedDay = async (page: Page) => {
  const me = await (await page.request.get("/api/me")).json()
  const vitaminD = me.household.supplements.find(({ name }: { name: string }) => name === "Vitamin D")
  const { played, emily } = await playHistory(page, [])
  const day = { ...emptyDay(DAY), doses: [dose("dose-1", vitaminD.id, local("08:00"), emily)] }
  played.days.push(day)
  return { day }
}

const doseMarker = (page: Page) => page.getByRole("button", { name: /^Vitamin D at 8:00\sAM: 400 IU$/u })

test("shows a dose on the Day view at its time, opening its details and then its edit sheet", async ({ page }) => {
  await playDosedDay(page)
  await openHistory(page)
  await doseMarker(page).click()
  const details = page.getByRole("dialog", { name: "Vitamin D" })
  await expect(details).toContainText("400 IU")
  await expect(details).toContainText("Emily (local)")
  await details.getByRole("button", { name: "Edit" }).click()
  await expect(page.getByRole("dialog", { name: "Edit dose" })).toContainText("Vitamin D · 400 IU")
})

test("hides doses with the Supplements chip, and says so", async ({ page }) => {
  await playDosedDay(page)
  await openHistory(page)
  await expect(doseMarker(page)).toBeVisible()
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Supplements" }).click()
  await expect(doseMarker(page)).toBeHidden()
  await expect(page.getByText("Supplements hidden")).toBeVisible()
  await expect(page).toHaveURL(/hide=supplements/u)
})

test("doesn't say Nothing logged. on a day holding only a dose, with its chip on or off", async ({ page }) => {
  await playDosedDay(page)
  await openHistory(page)
  await expect(doseMarker(page)).toBeVisible()
  await expect(page.getByText("Nothing logged.")).toHaveCount(0)
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Supplements" }).click()
  await expect(doseMarker(page)).toBeHidden()
  await expect(page.getByText("Nothing logged.")).toHaveCount(0)
})

test("fits the four chips on a 360-pixel-wide phone, wrapping them rather than scrolling the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await playDosedDay(page)
  await openHistory(page)
  const chips = page.getByRole("group", { name: "Show" }).getByRole("button")
  await expect(chips).toHaveText(["Feeds", "Diapers", "Growth", "Supplements"])
  const edges = await chips.evaluateAll((nodes) =>
    nodes.map((node) => {
      const { left, right } = node.getBoundingClientRect()
      return [Math.round(left), Math.round(right)]
    }),
  )
  expect(edges.every(([left = 0, right = 0]) => left >= 0 && right <= 360)).toBe(true)
  expect(await page.locator("html").evaluate((html) => html.scrollWidth - html.clientWidth)).toBe(0)
})

test("shows a dose on the Week view in its own lane, named in its day's link and the legend", async ({ page }) => {
  const { day } = await playDosedDay(page)
  await playWeeks(page, { [THIS_WEEK]: weekOf(THIS_WEEK, [day]) })
  await openHistory(page, "?view=week")
  await expect(weekGrid(page).getByRole("link", { name: "Fri, Oct 9: a dose" })).toBeVisible()
  await expect(page.getByText("Dose", { exact: true })).toBeVisible()
})

test("hides the Week view's dose lane and its legend entry with the Supplements chip", async ({ page }) => {
  const { day } = await playDosedDay(page)
  await playWeeks(page, { [THIS_WEEK]: weekOf(THIS_WEEK, [day]) })
  const doseDots = weekGrid(page).getByRole("listitem").locator("span.rounded-full.border-primary.bg-card")
  await openHistory(page, "?view=week")
  await expect(doseDots).toHaveCount(1)
  await expect(weekGrid(page).getByText("Dose", { exact: true })).toBeVisible()
  await openHistory(page, "?view=week&hide=supplements")
  await expect(weekGrid(page).getByRole("link", { name: /^Fri, Oct 9/u })).toBeVisible()
  await expect(weekGrid(page).getByText("Dose", { exact: true })).toHaveCount(0)
  await expect(doseDots).toHaveCount(0)
})

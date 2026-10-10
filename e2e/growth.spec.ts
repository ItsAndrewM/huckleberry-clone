import { expect, type Page, test } from "@playwright/test"

const NOW = Date.UTC(2026, 9, 9, 16, 30)
const BIRTH_DATE = "2026-09-01"

const at = (localDate: string, hour: number) => Date.parse(`${localDate}T${String(hour).padStart(2, "0")}:00:00-07:00`)

interface Metrics {
  readonly weightG?: number
  readonly lengthCm?: number
  readonly headCm?: number
}

const measurement = (id: string, measuredAt: number, metrics: Metrics) => ({
  id,
  measuredAt,
  weightG: metrics.weightG ?? null,
  lengthCm: metrics.lengthCm ?? null,
  headCm: metrics.headCm ?? null,
  version: 1,
  createdBy: "caregiver-andrew",
  createdAt: measuredAt,
  updatedBy: "caregiver-andrew",
  updatedAt: measuredAt,
  deletedAt: null,
})

type Measurement = ReturnType<typeof measurement>

const MEASUREMENTS = [
  measurement("m3", at("2026-10-06", 10), { weightG: 4300, lengthCm: 54.5, headCm: 36.8 }),
  measurement("m2", at("2026-09-15", 10), { weightG: 3600, headCm: 35.1 }),
  measurement("m1", at("2026-09-01", 10), { weightG: 3200, lengthCm: 49.5, headCm: 34 }),
]

interface HouseholdChange {
  readonly birthDate?: string
  readonly sex?: string
  readonly weight?: string
}

const playGrowth = async (page: Page, measurements: ReadonlyArray<Measurement>, change: HouseholdChange = {}) => {
  const me = await (await page.request.get("/api/me")).json()
  const household = {
    ...me.household,
    timeZone: "America/Vancouver",
    units: { volume: "ml", weight: change.weight ?? "kg", length: "cm" },
  }
  const child = { ...me.child, birthDate: change.birthDate ?? BIRTH_DATE, sex: change.sex ?? "female" }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household, child } }))
  await page.route("**/api/growth", (route) => route.fulfill({ json: { measurements } }))
}

const openGrowth = async (page: Page) => {
  await page.clock.setFixedTime(NOW)
  await page.goto("/growth")
}

const chart = (page: Page) => page.getByRole("img", { name: /-for-age, girls, birth to/ })
const herPoints = (page: Page) => page.locator('g[data-ts-key="her-points"] circle')
const curveLabels = (page: Page) => page.locator('g[data-ts-key="curve-labels"] text')
const monthTicks = (page: Page) => page.locator('text[data-ts-key^="x-tick-label"]')
const axisTitle = (page: Page) => page.locator('text[data-ts-key="y-label"]')
const tooltip = (page: Page) => page.locator(".ts-chart-tooltip")

const tapPoint = async (page: Page, index: number) => {
  const box = await herPoints(page).nth(index).boundingBox()
  if (box === null) throw new Error(`Measurement ${index} isn't on screen to tap`)
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}

test.use({ timezoneId: "Europe/London" })

test.describe("Growth, with the household's answers played by the test", () => {
  test("draws her weights over WHO's 3rd to 97th curves for girls, from birth to 6 months", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    const figure = page.getByRole("figure", { name: /WHO Child Growth Standards/ })
    await expect(figure.getByRole("heading", { name: "WHO Child Growth Standards", level: 2 })).toBeVisible()
    await expect(figure.getByRole("img", { name: "Weight-for-age, girls, birth to 6 months" })).toBeVisible()
    await expect(herPoints(page)).toHaveCount(3)
    await expect(curveLabels(page)).toHaveText(["3rd", "15th", "50th", "85th", "97th"])
    await expect(monthTicks(page)).toHaveText(["0", "1", "2", "3", "4", "5", "6"])
    await expect(axisTitle(page)).toHaveText("Weight (kg)")
  })

  test("switches to length and head circumference, each with its own measurements", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    await page.getByRole("button", { name: "Length" }).click()
    await expect(chart(page)).toHaveAccessibleName("Length-for-age, girls, birth to 6 months")
    await expect(herPoints(page)).toHaveCount(2)
    await expect(axisTitle(page)).toHaveText("Length (cm)")
    await page.getByRole("button", { name: "Head" }).click()
    await expect(chart(page)).toHaveAccessibleName("Head circumference-for-age, girls, birth to 6 months")
    await expect(herPoints(page)).toHaveCount(3)
  })

  test("shows a tapped measurement's date, age, weight and percentile, and only for her points", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    await tapPoint(page, 2)
    await expect(page.getByRole("dialog", { name: "Oct 6, 2026 · 1 mo 5 d · 4.30 kg · 47th" })).toBeVisible()
    await expect(tooltip(page)).toContainText("4.30 kg · 47th")
    await expect(tooltip(page)).toContainText("Oct 6, 2026 · 1 mo 5 d")
    await page.getByRole("heading", { name: "Growth", level: 1 }).tap()
    await expect(tooltip(page)).toBeHidden()
    const label = await curveLabels(page).filter({ hasText: "97th" }).boundingBox()
    if (label === null) throw new Error("The 97th curve's label isn't on screen")
    await page.touchscreen.tap(label.x - 12, label.y + label.height / 2)
    await expect(tooltip(page)).toBeHidden()
  })

  test("reaches each measurement from the keyboard, oldest first", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    await chart(page).focus()
    await expect(page.getByRole("status", { name: "Sep 1, 2026 · Birth · 3.20 kg · 47th" })).toBeVisible()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("status", { name: "Sep 15, 2026 · 14 d · 3.60 kg · 52nd" })).toBeVisible()
    await page.keyboard.press("End")
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog", { name: "Oct 6, 2026 · 1 mo 5 d · 4.30 kg · 47th" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(tooltip(page)).toBeHidden()
  })

  for (const { birthDate, months, ticks } of [
    { birthDate: "2026-03-01", months: 12, ticks: ["0", "2", "4", "6", "8", "10", "12"] },
    { birthDate: "2025-06-01", months: 24, ticks: ["0", "3", "6", "9", "12", "15", "18", "21", "24"] },
  ]) {
    test(`steps the age axis out to ${months} months once she's older than the smaller window`, async ({ page }) => {
      await playGrowth(page, MEASUREMENTS, { birthDate })
      await openGrowth(page)
      await expect(chart(page)).toHaveAccessibleName(`Weight-for-age, girls, birth to ${months} months`)
      await expect(monthTicks(page)).toHaveText(ticks)
      await expect(herPoints(page)).toHaveCount(3)
    })
  }

  test("shows WHO's curves before her first weight", async ({ page }) => {
    await playGrowth(page, [])
    await openGrowth(page)
    await expect(curveLabels(page)).toHaveText(["3rd", "15th", "50th", "85th", "97th"])
    await expect(herPoints(page)).toHaveCount(0)
    await expect(page.getByText("No weight measurements yet")).toBeVisible()
  })

  test("says there are no curves for a boy", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS, { sex: "male" })
    await openGrowth(page)
    await expect(
      page.getByText("WHO's curves here are for girls, so there are no curves or percentiles to show."),
    ).toBeVisible()
    await expect(chart(page)).toHaveCount(0)
  })

  test("draws the curves in the muted ink and her points in the accent, in light and in dark", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    const median = page.locator('path[data-ts-key^="curve-50:"]')
    await expect(median).toHaveCSS("stroke", "oklch(0.48 0.014 70)")
    await expect(herPoints(page).first()).toHaveCSS("fill", "oklch(0.47 0.09 290)")
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(median).toHaveCSS("stroke", "oklch(0.71 0.014 75)")
    await expect(herPoints(page).first()).toHaveCSS("fill", "oklch(0.77 0.075 290)")
  })
})

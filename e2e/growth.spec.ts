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
const tableRow = (page: Page, index: number) => page.getByRole("table").getByRole("row").nth(index).locator("th, td")

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

  test("shows each metric's newest value, percentile and date on its tile, with weight charted first", async ({
    page,
  }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    const tiles = page.getByRole("group", { name: "Measurement" }).getByRole("button")
    await expect(tiles).toHaveCount(3)
    await expect(tiles.nth(0)).toHaveAccessibleName("Weight: 4.30 kg, 47th, Oct 6, 2026")
    await expect(tiles.nth(1)).toHaveAccessibleName("Length: 54.5 cm, 55th, Oct 6, 2026")
    await expect(tiles.nth(2)).toHaveAccessibleName("Head: 36.8 cm, 48th, Oct 6, 2026")
    await expect(tiles.nth(0)).toHaveAttribute("aria-pressed", "true")
  })

  test("lists every measurement on a card, newest first, saying which metric wasn't measured", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    const cards = page.getByRole("region", { name: "Measurements" }).getByRole("listitem")
    await expect(cards.getByRole("heading", { level: 3 })).toHaveText([
      "Oct 6, 2026 · 1 mo 5 d",
      "Sep 15, 2026 · 14 d",
      "Sep 1, 2026 · Birth",
    ])
    await expect(cards.nth(1).getByRole("definition")).toHaveText([
      "3.60 kg",
      "52nd",
      "—Not measured",
      "35.1 cm",
      "46th",
    ])
  })

  test("switches to length and head circumference, each with its own measurements", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    await page.getByRole("button", { name: /^Length:/u }).click()
    await expect(chart(page)).toHaveAccessibleName("Length-for-age, girls, birth to 6 months")
    await expect(herPoints(page)).toHaveCount(2)
    await expect(axisTitle(page)).toHaveText("Length (cm)")
    await page.getByRole("button", { name: /^Head:/u }).click()
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

  test("lists her weights in a table, newest first", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS)
    await openGrowth(page)
    await page.getByText("Show as a table").click()
    const table = page.getByRole("table", { name: "Weight, newest first" })
    await expect(table).toBeVisible()
    await expect(table.getByRole("columnheader")).toHaveText(["Date", "Age", "Weight", "Percentile"])
    await expect(table.getByRole("row")).toHaveCount(4)
    await expect(table.getByRole("rowheader")).toHaveText(["Oct 6, 2026", "Sep 15, 2026", "Sep 1, 2026"])
    await expect(tableRow(page, 1)).toHaveText(["Oct 6, 2026", "1 mo 5 d", "4.30 kg", "47th"])
    await expect(tableRow(page, 2)).toHaveText(["Sep 15, 2026", "14 d", "3.60 kg", "52nd"])
    await expect(tableRow(page, 3)).toHaveText(["Sep 1, 2026", "Birth", "3.20 kg", "47th"])
  })

  test("plots pounds and lists pounds and ounces when the household weighs in lb & oz", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS, { weight: "lb_oz" })
    await openGrowth(page)
    await expect(axisTitle(page)).toHaveText("Weight (lb)")
    await page.getByText("Show as a table").click()
    await expect(tableRow(page, 1)).toHaveText(["Oct 6, 2026", "1 mo 5 d", "9 lb 7.7 oz", "47th"])
  })

  test("lists a measurement from after day 730 without plotting it or giving a percentile", async ({ page }) => {
    const late = measurement("late", at("2026-10-06", 10), { weightG: 12_500 })
    const earlier = measurement("earlier", at("2026-08-01", 10), { weightG: 12_000 })
    await playGrowth(page, [late, earlier], { birthDate: "2024-09-01" })
    await openGrowth(page)
    await expect(herPoints(page)).toHaveCount(1)
    await page.getByText("Show as a table").click()
    await expect(tableRow(page, 1)).toHaveText(["Oct 6, 2026", "25 mo 5 d", "12.50 kg", "Percentile unavailable"])
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

  test("shows WHO's curves before her first weight, with no table", async ({ page }) => {
    await playGrowth(page, [])
    await openGrowth(page)
    await expect(curveLabels(page)).toHaveText(["3rd", "15th", "50th", "85th", "97th"])
    await expect(herPoints(page)).toHaveCount(0)
    await expect(page.getByText("No weight measurements yet")).toBeVisible()
    await expect(page.getByText("Show as a table")).toHaveCount(0)
  })

  test("says there are no curves for a boy, and lists his weights without percentiles", async ({ page }) => {
    await playGrowth(page, MEASUREMENTS, { sex: "male" })
    await openGrowth(page)
    await expect(
      page.getByText("WHO's curves here are for girls, so there are no curves or percentiles to show."),
    ).toBeVisible()
    await expect(chart(page)).toHaveCount(0)
    await page.getByText("Show as a table").click()
    await expect(tableRow(page, 1)).toHaveText(["Oct 6, 2026", "1 mo 5 d", "4.30 kg", "Percentile unavailable"])
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

import { expect, type Page, test } from "@playwright/test"

const NOW = Date.UTC(2026, 9, 9, 16, 30)
const BIRTH_DATE = "2026-09-01"
const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const CM_PER_INCH = 2.54

const at = (localDate: string, hour: number) => Date.parse(`${localDate}T${String(hour).padStart(2, "0")}:00:00-07:00`)

interface Metrics {
  readonly weightG?: number
  readonly lengthCm?: number
  readonly headCm?: number
}

interface Measurement {
  readonly id: string
  readonly measuredAt: number
  readonly weightG: number | null
  readonly lengthCm: number | null
  readonly headCm: number | null
  readonly version: number
  readonly createdBy: string
  readonly createdAt: number
  readonly updatedBy: string
  readonly updatedAt: number
  readonly deletedAt: number | null
}

const measurement = (id: string, measuredAt: number, metrics: Metrics, by = "caregiver-andrew"): Measurement => ({
  id,
  measuredAt,
  weightG: metrics.weightG ?? null,
  lengthCm: metrics.lengthCm ?? null,
  headCm: metrics.headCm ?? null,
  version: 1,
  createdBy: by,
  createdAt: measuredAt,
  updatedBy: by,
  updatedAt: measuredAt,
  deletedAt: null,
})

const TAKEN_AT = at("2026-10-06", 10) + 42_123
const NEWEST = measurement("m3", TAKEN_AT, { weightG: 4300.4, lengthCm: 54.5, headCm: 36.8 })
const EARLIER = measurement("m2", at("2026-09-15", 10), { weightG: 3600, headCm: 35.1 })
const STORED = [NEWEST, EARLIER]

interface Sent {
  readonly method: string
  readonly path: string
  readonly body: object
}

interface Saved {
  readonly measurement: Measurement
  readonly changed: ReadonlyArray<ReadonlyArray<string>>
}

interface Refused {
  readonly _tag: "Conflict"
  readonly code: "STALE_VERSION"
  readonly current: Measurement
}

interface Units {
  readonly weight: "kg" | "g" | "lb_oz"
  readonly length: "cm" | "in"
}

const playGrowth = async (page: Page, measurements: ReadonlyArray<Measurement>, units: Units) => {
  const me = await (await page.request.get("/api/me")).json()
  const household = { ...me.household, timeZone: "America/Vancouver", units: { volume: "ml", ...units } }
  const child = { ...me.child, birthDate: BIRTH_DATE, sex: "female" }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household, child } }))
  const sent: Sent[] = []
  const played = { measurements, sent, caregivers: me.household.caregivers }
  const answer = (status: number, json: Saved | Refused, after = played.measurements) =>
    page.route(/\/api\/growth(\/[^/]+)?$/u, (route) => {
      const request = route.request()
      if (request.method() === "GET") return route.fulfill({ json: { measurements: played.measurements } })
      played.sent.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      })
      played.measurements = after
      return route.fulfill({ status, json })
    })
  return { played, answer }
}

const openGrowth = async (page: Page) => {
  await page.clock.setFixedTime(NOW)
  await page.goto("/growth")
  await page
    .getByRole("heading", { name: "Measurements" })
    .or(page.getByText(/^No weight/u))
    .first()
    .waitFor()
}

const saved = (answer: Measurement): Saved => ({ measurement: answer, changed: [["growth"]] })

test.use({ timezoneId: "Europe/London" })

test("adds a weight typed in kg to an lb & oz household, and lists it in lb & oz at once", async ({ page }) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "lb_oz", length: "in" })
  const added = measurement("m4", NOW, { weightG: 4325 })
  await answer(201, saved(added), [added, ...STORED])
  await openGrowth(page)
  await page.getByRole("button", { name: "Add measurement" }).click()
  const sheet = page.getByRole("dialog", { name: "Add measurement" })
  await sheet.getByRole("combobox", { name: "Weight unit" }).selectOption("kg")
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4.325")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "POST",
        path: "/api/growth",
        body: { actionId: ACTION_ID, measuredAt: NOW, weightG: 4325, lengthCm: null, headCm: null },
      },
    ])
  await expect(
    page.getByRole("button", { name: /^Weight: 9\slb 8\.6\soz, \d+(st|nd|rd|th), Oct 9, 2026$/u }),
  ).toBeVisible()
  await expect(page.getByRole("listitem").first()).toContainText("Oct 9, 2026")
})

test("edits a measurement from its card, sending what wasn't touched back unchanged, and opens Add blank after it", async ({
  page,
}) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "lb_oz", length: "in" })
  const edited = { ...NEWEST, version: 2, lengthCm: 21.75 * CM_PER_INCH }
  await answer(200, saved(edited), [edited, EARLIER])
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  const weight = sheet.getByRole("group", { name: "Weight" })
  await expect(weight.getByRole("textbox", { name: "Pounds" })).toHaveValue("9")
  await expect(weight.getByRole("textbox", { name: "Ounces" })).toHaveValue("7.7")
  await sheet.getByRole("textbox", { name: "Length" }).fill("21.75")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "PATCH",
        path: "/api/growth/m3",
        body: {
          actionId: ACTION_ID,
          version: 1,
          measuredAt: TAKEN_AT,
          weightG: 4300.4,
          lengthCm: 21.75 * CM_PER_INCH,
          headCm: 36.8,
        },
      },
    ])
  await page.getByRole("button", { name: "Add measurement" }).click()
  const blank = page.getByRole("dialog", { name: "Add measurement" })
  await expect(blank).toBeVisible()
  for (const name of ["Pounds", "Ounces", "Length", "Head circumference"]) {
    await expect(blank.getByRole("textbox", { name })).toHaveValue("")
  }
})

test("opens a measurement from anywhere on its card", async ({ page }) => {
  const { answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await answer(200, saved(EARLIER))
  await openGrowth(page)
  await page
    .getByRole("listitem")
    .filter({ hasText: "Sep 15, 2026" })
    .click({ position: { x: 60, y: 100 } })
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await expect(sheet.getByRole("textbox", { name: "Weight" })).toHaveValue("3.6")
  await expect(sheet.getByRole("textbox", { name: "Head circumference" })).toHaveValue("35.1")
})

test("asks before deleting a measurement whose every value is cleared", async ({ page }) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await answer(200, saved({ ...EARLIER, version: 2, deletedAt: NOW }), [NEWEST])
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Sep 15, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await sheet.getByRole("textbox", { name: "Weight" }).fill("")
  await sheet.getByRole("textbox", { name: "Head circumference" }).fill("")
  await expect(sheet.getByText("Every value is cleared. Delete this measurement?")).toBeVisible()
  await expect(sheet.getByRole("textbox", { name: "Head circumference" })).toBeFocused()
  await expect(sheet.getByRole("button", { name: "Keep it" })).toHaveCount(0)
  await expect(sheet.getByRole("button", { name: "Save" })).toHaveCount(0)
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([{ method: "DELETE", path: "/api/growth/m2", body: { actionId: ACTION_ID, version: 1 } }])
  await expect(page.getByRole("button", { name: "Edit the measurement from Sep 15, 2026" })).toHaveCount(0)
})

test("deletes a measurement only once the parent confirms", async ({ page }) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await answer(200, saved({ ...NEWEST, version: 2, deletedAt: NOW }), [EARLIER])
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await sheet.getByRole("button", { name: "Delete measurement" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Delete this measurement?")
  await expect(sheet.getByRole("button", { name: "Keep it" })).toBeFocused()
  await sheet.getByRole("button", { name: "Keep it" }).click()
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible()
  await sheet.getByRole("button", { name: "Delete measurement" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([{ method: "DELETE", path: "/api/growth/m3", body: { actionId: ACTION_ID, version: 1 } }])
})

test("keeps the focus in the field being typed in, though the delete was asked and every value cleared", async ({
  page,
}) => {
  const { answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await answer(200, saved(NEWEST))
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await sheet.getByRole("button", { name: "Delete measurement" }).click()
  for (const name of ["Weight", "Length", "Head circumference"]) {
    await sheet.getByRole("textbox", { name }).fill("")
  }
  await expect(sheet.getByText("Every value is cleared. Delete this measurement?")).toBeVisible()
  const weight = sheet.getByRole("textbox", { name: "Weight" })
  await weight.pressSequentially("45")
  await expect(weight).toHaveValue("45")
  await expect(weight).toBeFocused()
})

test("says who changed the measurement when the other phone saved first, and keeps the sheet open", async ({
  page,
}) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  const emily = played.caregivers[1]
  const current = { ...NEWEST, version: 2, weightG: 4350, updatedBy: emily.id }
  await answer(409, { _tag: "Conflict", code: "STALE_VERSION", current })
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4.4")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(`${emily.displayName} changed this measurement a moment ago.`)
  await expect(sheet.getByRole("textbox", { name: "Weight" })).toHaveValue("4.4")
})

test("lets go of a held edit when the parent deletes the measurement instead", async ({ page }) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  const emily = played.caregivers[1]
  const current = { ...NEWEST, version: 2, updatedBy: emily.id }
  await answer(409, { _tag: "Conflict", code: "STALE_VERSION", current })
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4.4")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(`${emily.displayName} changed this measurement a moment ago.`)
  await answer(200, saved({ ...NEWEST, version: 3, deletedAt: NOW }), [EARLIER])
  await sheet.getByRole("button", { name: "Delete measurement" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect.poll(() => played.sent.map(({ method }) => method)).toEqual(["PATCH", "DELETE"])
  await expect(page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" })).toHaveCount(0)
  await expect(page.getByRole("dialog")).toBeHidden()
})

test("refuses a number out of range, and points at the unit", async ({ page }) => {
  await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await openGrowth(page)
  await page.getByRole("button", { name: "Add measurement" }).click()
  const sheet = page.getByRole("dialog", { name: "Add measurement" })
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4325")
  await expect(sheet.getByText("Out of range. Check the number and its unit.")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
  await sheet.getByRole("combobox", { name: "Weight unit" }).selectOption("g")
  await expect(sheet.getByRole("button", { name: "Save" })).toBeEnabled()
})

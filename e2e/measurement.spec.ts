import type { Page } from "@playwright/test"
import { gate, holdRequests } from "./played-household.ts"
import { expect, test } from "./test.ts"

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

const GROWTH = /\/api\/growth(\/[^/]+)?$/u

const playGrowth = async (page: Page, measurements: ReadonlyArray<Measurement>, units: Units) => {
  const me = await (await page.request.get("/api/me")).json()
  const household = { ...me.household, timeZone: "America/Vancouver", units: { volume: "ml", ...units } }
  const child = { ...me.child, birthDate: BIRTH_DATE, sex: "female" }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household, child } }))
  const sent: Sent[] = []
  const played = { measurements, sent, caregivers: me.household.caregivers }
  await page.route(GROWTH, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { measurements: played.measurements } })
      : route.fallback(),
  )
  const answer = (status: number, json?: Saved | Refused, after = played.measurements) =>
    page.route(GROWTH, (route) => {
      const request = route.request()
      if (request.method() === "GET") return route.fallback()
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

const typeAddBehindHeldEdit = async (page: Page, held: ReadonlyArray<string>) => {
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const edit = page.getByRole("dialog", { name: "Edit measurement" })
  await edit.getByRole("textbox", { name: "Length" }).fill("55")
  await edit.getByRole("button", { name: "Save" }).click()
  await expect.poll(() => held.length).toBe(1)
  await page.getByRole("button", { name: "Add measurement" }).click()
  await page.getByRole("dialog", { name: "Add measurement" }).getByRole("textbox", { name: "Weight" }).fill("4.5")
}

test.use({ timezoneId: "Europe/London" })

test("adds a weight typed in kg to an lb & oz household, and lists it in lb & oz at once", async ({ page }) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "lb_oz", length: "in" })
  const added = measurement("m4", NOW, { weightG: 4325 })
  await answer(201, saved(added), [added, ...STORED])
  await openGrowth(page)
  const answered = gate()
  const held = await holdRequests(page, "**/api/growth", () => answered.opened)
  await page.getByRole("button", { name: "Add measurement" }).click()
  const sheet = page.getByRole("dialog", { name: "Add measurement" })
  await sheet.getByRole("combobox", { name: "Weight unit" }).selectOption("kg")
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4.325")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect.poll(() => held.length).toBe(1)
  const tile = page.getByRole("button", { name: /^Weight: 9\slb 8\.6\soz, \d+(st|nd|rd|th), Oct 9, 2026$/u })
  const card = page.getByRole("listitem").first()
  const chevron = card.getByRole("button", { name: "Edit the measurement from Oct 9, 2026" })
  await expect(tile).toBeVisible()
  await expect(card).toContainText("Oct 9, 2026")
  await expect(card).toContainText("Saving…")
  await expect(chevron).toHaveCount(0)
  answered.open()
  await expect(chevron).toBeVisible()
  await expect(card).not.toContainText("Saving…")
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "POST",
        path: "/api/growth",
        body: { actionId: ACTION_ID, measuredAt: NOW, weightG: 4325, lengthCm: null, headCm: null },
      },
    ])
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
  await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await openGrowth(page)
  await page.getByRole("listitem").filter({ hasText: "Sep 15, 2026" }).locator("dl").click({ force: true })
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await expect(sheet.getByRole("textbox", { name: "Weight" })).toHaveValue("3.6")
  await expect(sheet.getByRole("textbox", { name: "Head circumference" })).toHaveValue("35.1")
})

test("shows Saving… on the card until the household answers", async ({ page }) => {
  const { answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  const edited = { ...NEWEST, version: 2, lengthCm: 55 }
  await answer(200, saved(edited), [edited, EARLIER])
  const answered = gate()
  const held = await holdRequests(page, "**/api/growth/m3", () => answered.opened)
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await sheet.getByRole("textbox", { name: "Length" }).fill("55")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect.poll(() => held.length).toBe(1)
  const card = page.getByRole("listitem").filter({ hasText: "Oct 6, 2026" })
  const chevron = card.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" })
  await expect(card).toContainText("Saving…")
  await expect(chevron).toHaveCount(0)
  answered.open()
  await expect(chevron).toBeVisible()
  await expect(card).not.toContainText("Saving…")
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
  await playGrowth(page, STORED, { weight: "kg", length: "cm" })
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

test("says who changed the measurement when the other phone saved first, keeps what the parent typed, and saves it on top when asked", async ({
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
  const alert = sheet.getByRole("alert")
  await expect(alert).toContainText(`${emily.displayName} changed this measurement a moment ago.`)
  await expect(sheet.getByRole("textbox", { name: "Weight" })).toHaveValue("4.4")
  await answer(200, saved({ ...NEWEST, version: 3, weightG: 4400 }))
  await alert.getByRole("button", { name: "Save mine anyway" }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => played.sent.map(({ body }) => ("version" in body ? body.version : undefined))).toEqual([1, 2])
})

test("lets go of a held edit when the parent deletes the measurement instead, and deletes the newer copy on the second try", async ({
  page,
}) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  const emily = played.caregivers[1]
  const current = { ...NEWEST, version: 2, updatedBy: emily.id }
  await answer(409, { _tag: "Conflict", code: "STALE_VERSION", current }, [current, EARLIER])
  await openGrowth(page)
  await page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  const weight = sheet.getByRole("textbox", { name: "Weight" })
  await weight.fill("4.4")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this measurement a moment ago.`)
  await expect(weight).toHaveValue("4.4")
  await sheet.getByRole("button", { name: "Delete measurement" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(weight).toHaveValue("4.3")
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this measurement a moment ago.`)
  await answer(200, saved({ ...NEWEST, version: 3, deletedAt: NOW }), [EARLIER])
  await sheet.getByRole("button", { name: "Delete measurement" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
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
          weightG: 4400,
          lengthCm: 54.5,
          headCm: 36.8,
        },
      },
      { method: "DELETE", path: "/api/growth/m3", body: { actionId: ACTION_ID, version: 1 } },
      { method: "DELETE", path: "/api/growth/m3", body: { actionId: ACTION_ID, version: 2 } },
    ])
  await expect(page.getByRole("button", { name: "Edit the measurement from Oct 6, 2026" })).toHaveCount(0)
  await expect(page.getByRole("dialog")).toBeHidden()
})

test("keeps Add, with its typed weight, when the edit sent just before it fails", async ({ page }) => {
  const { answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await answer(500)
  const answered = gate()
  const held = await holdRequests(page, "**/api/growth/m3", () => answered.opened)
  await typeAddBehindHeldEdit(page, held)
  answered.open()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByRole("alert")).toContainText("Not saved.")
  await expect(sheet).toHaveAccessibleName("Add measurement")
  await expect(sheet.getByRole("textbox", { name: "Weight" })).toHaveValue("4.5")
})

test("keeps Add, with its typed weight, when the edit sent just before it finds the measurement deleted", async ({
  page,
}) => {
  const { played, answer } = await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  const emily = played.caregivers[1]
  const current = { ...NEWEST, version: 2, updatedBy: emily.id, deletedAt: NOW }
  await answer(409, { _tag: "Conflict", code: "STALE_VERSION", current }, [EARLIER])
  const answered = gate()
  const held = await holdRequests(page, "**/api/growth/m3", () => answered.opened)
  await typeAddBehindHeldEdit(page, held)
  answered.open()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} deleted this measurement a moment ago.`)
  await expect(sheet.getByRole("alert").getByRole("button", { name: "Save mine anyway" })).toHaveCount(0)
  const card = page.getByRole("listitem", { includeHidden: true }).filter({ hasText: "Oct 6, 2026" })
  await expect(card).toHaveCount(0)
  await expect(sheet).toHaveAccessibleName("Add measurement")
  await expect(sheet.getByText("This measurement was deleted.")).toHaveCount(0)
  await expect(sheet.getByRole("textbox", { name: "Weight" })).toHaveValue("4.5")
})

test("refuses a number out of range, and points at the unit", async ({ page }) => {
  await playGrowth(page, STORED, { weight: "kg", length: "cm" })
  await openGrowth(page)
  await page.getByRole("button", { name: "Add measurement" }).click()
  const sheet = page.getByRole("dialog", { name: "Add measurement" })
  const reason = "Out of range. Check the number and its unit."
  const weight = sheet.getByRole("textbox", { name: "Weight" })
  await weight.fill("4325")
  await expect(sheet.getByText(reason)).toBeVisible()
  await expect(weight).toHaveAccessibleDescription(reason)
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
  await sheet.getByRole("combobox", { name: "Weight unit" }).selectOption("lb_oz")
  for (const name of ["Pounds", "Ounces"]) {
    await expect(sheet.getByRole("textbox", { name })).toHaveAccessibleDescription(reason)
  }
  await sheet.getByRole("combobox", { name: "Weight unit" }).selectOption("g")
  await expect(sheet.getByRole("button", { name: "Save" })).toBeEnabled()
  await expect(weight).toHaveAccessibleDescription("")
})

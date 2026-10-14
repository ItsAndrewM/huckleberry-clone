import { expect, type Page, test } from "@playwright/test"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const AT = Date.UTC(2026, 9, 9, 16, 30)

interface Supplement {
  readonly id: string
  readonly name: string
  readonly dose: string
  readonly stoppedAt: number | null
  readonly version: number
  readonly createdBy: string | null
  readonly createdAt: number
  readonly updatedBy: string | null
  readonly updatedAt: number
}

interface Body {
  readonly name: string
  readonly dose: string
  readonly version?: number
  readonly stopped?: boolean
}

const playSupplements = async (page: Page) => {
  const me = await (await page.request.get("/api/me")).json()
  const vitaminD: Supplement = me.household.supplements.find(({ name }: Supplement) => name === "Vitamin D")
  const sent: Array<{ readonly method: string; readonly path: string; readonly body: Body }> = []
  const played = { supplements: [vitaminD], sent }
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { ...me, household: { ...me.household, supplements: played.supplements } } }),
  )
  await page.route("**/api/supplements**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body: Body = request.postDataJSON()
    played.sent.push({ method: request.method(), path, body })
    const id = path.split("/").at(-1) ?? ""
    const current = played.supplements.find((supplement) => supplement.id === id)
    const saved: Supplement =
      current === undefined
        ? { ...vitaminD, id: "supplement-new", name: body.name, dose: body.dose, version: 1, stoppedAt: null }
        : {
            ...current,
            name: body.name,
            dose: body.dose,
            stoppedAt: body.stopped === true ? (current.stoppedAt ?? AT) : null,
            version: current.version + 1,
          }
    played.supplements = [...played.supplements.filter(({ id: kept }) => kept !== saved.id), saved]
    await route.fulfill({ status: current === undefined ? 201 : 200, json: { supplement: saved, changed: [["me"]] } })
  })
  return { played, vitaminD }
}

const section = (page: Page) => page.getByRole("list", { name: "Supplements" })
const stoppedList = (page: Page) => page.getByRole("list", { name: "Stopped" })
const sheetOf = (page: Page, name: string) => page.getByRole("dialog", { name })

test("adds a supplement from Settings with its dose, and Today then lists it", async ({ page }) => {
  const { played } = await playSupplements(page)
  await page.goto("/settings")
  await page.getByRole("button", { name: "Add a supplement" }).click()
  const sheet = sheetOf(page, "Add a supplement")
  await sheet.getByLabel("Name").fill("Iron")
  await sheet.getByLabel("Dose").fill(" 1 mL ")
  await sheet.getByRole("button", { name: "Add supplement" }).click()
  await expect(sheet).toBeHidden()
  expect(played.sent).toEqual([
    { method: "POST", path: "/api/supplements", body: { actionId: ACTION_ID, name: "Iron", dose: "1 mL" } },
  ])
  await expect(section(page).getByRole("button")).toHaveText(["Vitamin D · 400 IU", "Iron · 1 mL"])
  await page.getByRole("link", { name: "Today" }).click()
  await expect(page.getByRole("list", { name: "Supplements" })).toContainText("Iron not logged yet today")
})

test("renames a supplement and changes its dose from the version it opened on", async ({ page }) => {
  const { played, vitaminD } = await playSupplements(page)
  await page.goto("/settings")
  await section(page).getByRole("button", { name: "Vitamin D · 400 IU" }).click()
  const sheet = sheetOf(page, "Vitamin D")
  await expect(sheet.getByLabel("Dose")).toHaveValue("400 IU")
  await sheet.getByLabel("Name").fill("Vitamin D3")
  await sheet.getByLabel("Dose").fill("800 IU")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  expect(played.sent).toEqual([
    {
      method: "PATCH",
      path: `/api/supplements/${vitaminD.id}`,
      body: { actionId: ACTION_ID, version: vitaminD.version, name: "Vitamin D3", dose: "800 IU", stopped: false },
    },
  ])
  await expect(section(page)).toContainText("Vitamin D3 · 800 IU")
})

test("stops giving a supplement, which then leaves Today, and gives it again", async ({ page }) => {
  const { played } = await playSupplements(page)
  await page.goto("/settings")
  await section(page).getByRole("button", { name: "Vitamin D · 400 IU" }).click()
  const sheet = sheetOf(page, "Vitamin D")
  await sheet.getByRole("button", { name: "Stop giving it" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(
    "Stop giving Vitamin D? Today won't list it until you give it again.StopKeep giving it",
  )
  expect(played.sent).toEqual([])
  await sheet.getByRole("alert").getByRole("button", { name: "Stop" }).click()
  await expect(stoppedList(page).getByRole("button")).toHaveText(["Vitamin D · 400 IU"])
  await expect(section(page)).toBeHidden()
  await page.getByRole("link", { name: "Today" }).click()
  await expect(page.getByText("Totals")).toBeVisible()
  await expect(page.getByRole("list", { name: "Supplements" })).toBeHidden()
  await page.getByRole("link", { name: "Settings" }).click()
  await stoppedList(page).getByRole("button", { name: "Vitamin D · 400 IU" }).click()
  await sheetOf(page, "Vitamin D").getByRole("button", { name: "Give it again" }).click()
  await expect(section(page).getByRole("button")).toHaveText(["Vitamin D · 400 IU"])
  expect(played.sent.map(({ body }) => body.stopped)).toEqual([true, false])
})

test("keeps giving a supplement when the parent changes their mind about stopping it", async ({ page }) => {
  const { played } = await playSupplements(page)
  await page.goto("/settings")
  await section(page).getByRole("button", { name: "Vitamin D · 400 IU" }).click()
  const sheet = sheetOf(page, "Vitamin D")
  await sheet.getByRole("button", { name: "Stop giving it" }).click()
  const keep = sheet.getByRole("alert").getByRole("button", { name: "Keep giving it" })
  await expect(keep).toBeFocused()
  await keep.click()
  await expect(sheet.getByRole("alert")).toBeHidden()
  await expect(sheet.getByRole("button", { name: "Stop giving it" })).toBeVisible()
  expect(played.sent).toEqual([])
})

test("says what a name needs before sending a supplement with none", async ({ page }) => {
  const { played } = await playSupplements(page)
  await page.goto("/settings")
  await page.getByRole("button", { name: "Add a supplement" }).click()
  const sheet = sheetOf(page, "Add a supplement")
  await sheet.getByRole("button", { name: "Add supplement" }).click()
  await expect(sheet.getByText("Enter a name of up to 60 characters.")).toBeVisible()
  expect(played.sent).toEqual([])
})

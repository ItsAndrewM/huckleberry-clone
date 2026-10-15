import type { Locator, Page } from "@playwright/test"
import { gate, holdRequests } from "./played-household.ts"
import { sheetTitlesSeen, watchSheetTitles } from "./sheet-titles.ts"
import { expect, type PlayedSocket, test } from "./test.ts"

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

type Played = Awaited<ReturnType<typeof playSupplements>>["played"]

const otherPhone = (socket: PlayedSocket, played: Played) => async (id: string, change: Partial<Supplement>) => {
  played.supplements = played.supplements.map((supplement) =>
    supplement.id === id ? { ...supplement, ...change, version: supplement.version + 1 } : supplement,
  )
  await socket.changed(["me"])
}

const section = (page: Page) => page.getByRole("list", { name: "Supplements" })
const stoppedList = (page: Page) => page.getByRole("list", { name: "Stopped" })
const sheetOf = (page: Page, name: string) => page.getByRole("dialog", { name })

const spillsOut = (row: Locator) => row.evaluate((button) => button.scrollWidth > button.clientWidth)
const widthOfPage = (page: Page) => page.locator("html").evaluate((root) => root.scrollWidth)

const textEndOf = (target: Locator) =>
  target.evaluate((element) => {
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    return range.getBoundingClientRect().right
  })

const rightEdgeOf = async (target: Locator) => {
  const box = await target.boundingBox()
  if (box === null) throw new Error(`${target} isn't on screen to measure`)
  return box.x + box.width
}

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

test("adds a supplement under one actionId however often its sheet's Add is tapped, so a lost answer can't add it twice", async ({
  page,
}) => {
  const { played } = await playSupplements(page)
  const tapped: string[] = []
  await page.route("**/api/supplements", async (route) => {
    const { actionId }: { actionId: string } = route.request().postDataJSON()
    tapped.push(actionId)
    if (tapped.length === 1) return route.abort("internetdisconnected")
    return route.fallback()
  })
  await page.goto("/settings")
  await page.getByRole("button", { name: "Add a supplement" }).click()
  const sheet = sheetOf(page, "Add a supplement")
  await sheet.getByLabel("Name").fill("Iron")
  await sheet.getByLabel("Dose").fill("1 mL")
  await sheet.getByRole("button", { name: "Add supplement" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(/no connection/u)
  await sheet.getByRole("button", { name: "Add supplement" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(tapped).toEqual([ACTION_ID, tapped[0]])
  expect(played.sent).toHaveLength(1)
  await page.getByRole("button", { name: "Add a supplement" }).click()
  await sheetOf(page, "Add a supplement").getByLabel("Name").fill("Zinc")
  await sheetOf(page, "Add a supplement").getByRole("button", { name: "Add supplement" }).click()
  await expect.poll(() => tapped).toHaveLength(3)
  expect(tapped[2]).not.toBe(tapped[0])
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

test("keeps the sheet on the supplement it opened while it slides away after a save", async ({ page }) => {
  await playSupplements(page)
  await page.goto("/settings")
  await section(page).getByRole("button", { name: "Vitamin D · 400 IU" }).click()
  const sheet = sheetOf(page, "Vitamin D")
  await sheet.getByLabel("Dose").fill("600 IU")
  await watchSheetTitles(page)
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await sheetTitlesSeen(page)).toEqual(["Vitamin D"])
  await expect(section(page)).toContainText("Vitamin D · 600 IU")
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

test("clears a field's message as soon as the parent edits that field", async ({ page }) => {
  await playSupplements(page)
  await page.goto("/settings")
  await page.getByRole("button", { name: "Add a supplement" }).click()
  const sheet = sheetOf(page, "Add a supplement")
  await sheet.getByRole("button", { name: "Add supplement" }).click()
  const message = sheet.getByText("Enter a name of up to 60 characters.")
  await expect(message).toBeVisible()
  await expect(sheet.getByLabel("Name")).toHaveAttribute("aria-invalid", "true")
  await sheet.getByLabel("Name").fill("Iron")
  await expect(message).toBeHidden()
  await expect(sheet.getByLabel("Name")).toHaveAttribute("aria-invalid", "false")
})

test("still closes the sheet once a save is answered when the parent types in it while it's on its way", async ({
  page,
}) => {
  await playSupplements(page)
  const answered = gate()
  await holdRequests(page, "**/api/supplements", () => answered.opened)
  await page.goto("/settings")
  await page.getByRole("button", { name: "Add a supplement" }).click()
  const sheet = sheetOf(page, "Add a supplement")
  await sheet.getByLabel("Name").fill("Iron")
  await sheet.getByRole("button", { name: "Add supplement" }).click()
  await expect(sheet.getByRole("button", { name: "Add supplement" })).toBeDisabled()
  await sheet.getByLabel("Dose").fill("1 mL")
  answered.open()
  await expect(sheet).toBeHidden()
})

const LONGEST = [
  {
    written: "with spaces",
    name: "Cholecalciferol (vitamin D3) liquid drops for infants, 400IU",
    given: "1 dropperful each morning with breakfast",
  },
  { written: "with no spaces", name: "Multivitamin".repeat(5), given: "W".repeat(40) },
]

for (const { written, name, given } of LONGEST) {
  test(`wraps the longest name and dose ${written} in Settings, in use or stopped, instead of widening a 360-pixel-wide page`, async ({
    page,
  }) => {
    expect([name.length, given.length]).toEqual([60, 40])
    const { played, vitaminD } = await playSupplements(page)
    played.supplements = [
      { ...vitaminD, id: "supplement-long", name, dose: given },
      { ...vitaminD, id: "supplement-long-stopped", name, dose: given, stoppedAt: AT },
    ]
    await page.setViewportSize({ width: 360, height: 900 })
    await page.goto("/settings")
    await expect(section(page).getByRole("button")).toHaveCount(1)
    await expect(stoppedList(page).getByRole("button")).toHaveCount(1)
    expect(await spillsOut(section(page).getByRole("button"))).toBe(false)
    expect(await spillsOut(stoppedList(page).getByRole("button"))).toBe(false)
    expect(await widthOfPage(page)).toBeLessThanOrEqual(360)
  })
}

for (const { written, name, given } of LONGEST) {
  test(`keeps the longest name ${written} inside its sheet's title and stop question on a 360-pixel-wide phone`, async ({
    page,
  }) => {
    const { played, vitaminD } = await playSupplements(page)
    played.supplements = [{ ...vitaminD, id: "supplement-long", name, dose: given }]
    await page.setViewportSize({ width: 360, height: 900 })
    await page.goto("/settings")
    await section(page).getByRole("button").click()
    const sheet = sheetOf(page, name)
    await sheet.getByRole("button", { name: "Stop giving it" }).click()
    const question = sheet.getByRole("alert").getByText(/^Stop giving /u)
    await expect(question).toBeVisible()
    const right = await rightEdgeOf(sheet)
    expect(await textEndOf(sheet.getByRole("heading", { name }))).toBeLessThanOrEqual(right)
    expect(await textEndOf(question)).toBeLessThanOrEqual(right)
    expect(await widthOfPage(page)).toBeLessThanOrEqual(360)
  })
}

test("shows the other phone's rename in the sheet that was open, and saves a dose change on top of it", async ({
  page,
  socket,
}) => {
  const { played, vitaminD } = await playSupplements(page)
  const otherPhoneSaves = otherPhone(socket, played)
  await page.goto("/settings")
  await section(page).getByRole("button", { name: "Vitamin D · 400 IU" }).click()
  const sheet = sheetOf(page, "Vitamin D")
  await expect(sheet.getByLabel("Name")).toHaveValue("Vitamin D")
  await otherPhoneSaves(vitaminD.id, { name: "Vitamin D3" })
  await expect(sheet.getByRole("heading")).toHaveText("Vitamin D3")
  await expect(sheet.getByLabel("Name")).toHaveValue("Vitamin D3")
  await sheet.getByLabel("Dose").fill("800 IU")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  expect(played.sent).toEqual([
    {
      method: "PATCH",
      path: `/api/supplements/${vitaminD.id}`,
      body: { actionId: ACTION_ID, version: vitaminD.version + 1, name: "Vitamin D3", dose: "800 IU", stopped: false },
    },
  ])
})

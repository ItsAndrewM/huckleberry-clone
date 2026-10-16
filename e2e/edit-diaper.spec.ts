import type { Page } from "@playwright/test"
import {
  caregiversOf,
  gate,
  holdRequests,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  savedBy,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "Europe/London" })

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const recent = (page: Page) => page.getByRole("list", { name: "Last 24 hours" })
const editSheet = (page: Page) => page.getByRole("dialog", { name: "Edit diaper" })

const playDiaper = async (page: Page, occurredAt = NOW - 30 * MINUTE) => {
  const { andrew, emily } = await caregiversOf(page)
  const diaper = { id: "diaper-1", occurredAt, wet: true, dirty: false, ...savedBy(andrew.id) }
  const household = await playHousehold(page, { ...todayWith(), recent: [{ kind: "diaper", diaper }] })
  const showing = (shown: typeof diaper | null) => {
    household.played.today = { ...todayWith(), recent: shown === null ? [] : [{ kind: "diaper", diaper: shown }] }
  }
  return { ...household, diaper, emily, showing }
}

const openTheDiaper = async (page: Page) => {
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /Diaper/u })
    .click()
  return editSheet(page)
}

test("edits a diaper from Today, showing the change before the household answers", async ({ page }) => {
  const { answer, played, diaper, showing } = await playDiaper(page)
  await answer("**/api/diapers/diaper-1", ({ body }) => {
    const edited = { ...diaper, wet: body.wet ?? true, dirty: body.dirty ?? false, version: 2 }
    showing(edited)
    return { status: 200, json: { diaper: edited, changed: [["today"]] } }
  })
  const answered = gate()
  await holdRequests(page, "**/api/diapers/diaper-1", () => answered.opened)
  const sheet = await openTheDiaper(page)
  await expect(sheet.getByLabel("When")).toHaveValue("2026-10-09T09:00")
  await sheet.getByRole("button", { name: "Both" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page)).toContainText("Pee and poo")
  answered.open()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "PATCH",
        path: "/api/diapers/diaper-1",
        body: { actionId: ACTION_ID, version: 1, occurredAt: NOW - 30 * MINUTE, wet: true, dirty: true },
      },
    ])
  await expect(recent(page)).toContainText("Pee and poo")
})

test("keeps a diaper's time to the second when only its kind changes", async ({ page }) => {
  const occurredAt = NOW - 30 * MINUTE + 37_412
  const { answer, played, diaper, showing } = await playDiaper(page, occurredAt)
  await answer("**/api/diapers/diaper-1", ({ body }) => {
    const edited = { ...diaper, wet: body.wet ?? true, dirty: body.dirty ?? false, version: 2 }
    showing(edited)
    return { status: 200, json: { diaper: edited, changed: [["today"]] } }
  })
  const sheet = await openTheDiaper(page)
  await expect(sheet.getByLabel("When")).toHaveValue("2026-10-09T09:00")
  await sheet.getByRole("button", { name: "Poo" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "PATCH",
        path: "/api/diapers/diaper-1",
        body: { actionId: ACTION_ID, version: 1, occurredAt, wet: false, dirty: true },
      },
    ])
})

test("deletes a diaper after asking, takes it off Today at once, and Undo restores it", async ({ page }) => {
  const { answer, played, diaper, showing } = await playDiaper(page)
  await answer("**/api/diapers/diaper-1", () => {
    showing(null)
    return { status: 200, json: { diaper: { ...diaper, version: 2, deletedAt: NOW }, changed: [["today"]] } }
  })
  await answer("**/api/diapers/diaper-1/restore", () => {
    showing({ ...diaper, version: 3 })
    return { status: 200, json: { diaper: { ...diaper, version: 3 }, changed: [["today"]] } }
  })
  const sheet = await openTheDiaper(page)
  await sheet.getByRole("button", { name: "Delete diaper" }).click()
  await sheet.getByRole("alert").getByRole("button", { name: "Delete" }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText("Nothing logged in the last 24 hours.")).toBeVisible()
  await page.getByRole("status").filter({ hasText: "Diaper deleted" }).getByRole("button", { name: "Undo" }).click()
  await expect(recent(page)).toContainText("Pee")
  expect(played.sent.map(({ method, path, body }) => [method, path, body.version])).toEqual([
    ["DELETE", "/api/diapers/diaper-1", 1],
    ["POST", "/api/diapers/diaper-1/restore", 2],
  ])
})

const meetEmily = async (page: Page) => {
  const household = await playDiaper(page)
  const theirs = { ...household.diaper, version: 2, wet: false, dirty: true, updatedBy: household.emily.id }
  await household.answer("**/api/diapers/diaper-1", ({ body }) => {
    if (household.played.sent.length === 1) {
      household.showing(theirs)
      return { status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } }
    }
    const mine = { ...theirs, wet: body.wet ?? true, dirty: body.dirty ?? false, version: 3 }
    household.showing(mine)
    return { status: 200, json: { diaper: mine, changed: [["today"]] } }
  })
  const sheet = await openTheDiaper(page)
  await sheet.getByRole("button", { name: "Both" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  const alert = sheet.getByRole("alert")
  await expect(alert).toContainText(`${household.emily.displayName} changed this a moment ago.`)
  await expect(alert).toContainText(/It now reads: Diaper at 9:00\sAM: Poo\./u)
  return { ...household, sheet }
}

test("says who changed the diaper first, and saves mine on top of theirs when asked", async ({ page }) => {
  const { played, sheet } = await meetEmily(page)
  await sheet.getByRole("button", { name: "Save mine anyway" }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page)).toContainText("Pee and poo")
  const [first, second] = played.sent.map(({ body }) => body)
  expect(second).toEqual({ ...first, version: 2 })
})

test("puts Emily's version in the form when asked, and sends nothing more", async ({ page }) => {
  const { played, sheet, emily } = await meetEmily(page)
  await sheet.getByRole("button", { name: `Use ${emily.displayName}'s` }).click()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await expect(sheet.getByRole("button", { name: "Poo" })).toHaveAttribute("aria-pressed", "true")
  expect(played.sent).toHaveLength(1)
})

test("loads Emily's version into the form even when it reached this phone before the save", async ({
  page,
  socket,
}) => {
  const { answer, showing, diaper, emily } = await playDiaper(page)
  const theirs = { ...diaper, version: 2, wet: false, dirty: true, updatedBy: emily.id }
  await answer("**/api/diapers/diaper-1", () => ({
    status: 409,
    json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs },
  }))
  const sheet = await openTheDiaper(page)
  await expect(sheet.getByRole("button", { name: "Pee" })).toHaveAttribute("aria-pressed", "true")
  showing(theirs)
  await socket.changed(["today"])
  await expect(page.getByRole("list", { name: "Last 24 hours", includeHidden: true })).toContainText("Poo")
  await sheet.getByRole("button", { name: "Both" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this a moment ago.`)
  await sheet.getByRole("button", { name: `Use ${emily.displayName}'s` }).click()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await expect(sheet.getByRole("button", { name: "Poo" })).toHaveAttribute("aria-pressed", "true")
  await expect(sheet.getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "false")
})

test("puts the diaper back and reopens its sheet with the reason when the edit can't be sent", async ({ page }) => {
  await playDiaper(page)
  await page.route("**/api/diapers/diaper-1", (route) => route.abort("internetdisconnected"))
  const sheet = await openTheDiaper(page)
  await sheet.getByRole("button", { name: "Poo" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText(
    "No connection. Keep the app open, and try again once you're back online.",
  )
  await expect(sheet.getByRole("button", { name: "Poo" })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText("Discard your changes?DiscardKeep")
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page).getByRole("button", { name: /Diaper/u })).toContainText("Pee")
})

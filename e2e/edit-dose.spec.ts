import { expect, type Page, test } from "@playwright/test"
import {
  caregiversOf,
  type DoseAnswer,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  savedBy,
  todayWith,
} from "./played-household.ts"

test.use({ timezoneId: "Europe/London" })

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const recent = (page: Page) => page.getByRole("list", { name: "Last 24 hours" })
const editSheet = (page: Page) => page.getByRole("dialog", { name: "Edit dose" })

const playDose = async (page: Page, occurredAt = NOW - 30 * MINUTE) => {
  const { andrew, emily, me } = await caregiversOf(page)
  const vitaminD = me.household.supplements.find(({ name }: { name: string }) => name === "Vitamin D")
  const dose: DoseAnswer = {
    id: "dose-1",
    supplementId: vitaminD.id,
    occurredAt,
    localDate: "2026-10-09",
    dose: "400 IU",
    ...savedBy(andrew.id),
  }
  const showing = (shown: DoseAnswer | null) => {
    household.played.today = {
      ...todayWith(),
      recent: shown === null ? [] : [{ kind: "dose", dose: shown }],
      doses: shown === null ? [] : [shown],
    }
  }
  const household = await playHousehold(page, todayWith())
  showing(dose)
  return { ...household, dose, emily, showing }
}

const openTheDose = async (page: Page) => {
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /Vitamin D/u })
    .click()
  return editSheet(page)
}

test("moves a dose from Today, keeping its supplement and dose, and the card follows it", async ({ page }) => {
  const { answer, played, dose, showing } = await playDose(page)
  await answer("**/api/doses/dose-1", ({ body }) => {
    const moved = { ...dose, occurredAt: body.occurredAt ?? NOW, version: 2 }
    showing(moved)
    return { status: 200, json: { dose: moved, changed: [["today"]] } }
  })
  const sheet = await openTheDose(page)
  await expect(sheet).toContainText("Vitamin D · 400 IU")
  await expect(sheet.getByLabel("When")).toHaveValue("2026-10-09T09:00")
  await sheet.getByLabel("When").fill("2026-10-09T08:15")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "PATCH",
        path: "/api/doses/dose-1",
        body: { actionId: ACTION_ID, version: 1, occurredAt: NOW - 75 * MINUTE },
      },
    ])
  await expect(page.getByRole("list", { name: "Supplements" })).toContainText("Vitamin D logged at 8:15")
})

test("keeps a dose's time to the second when it's saved untouched", async ({ page }) => {
  const occurredAt = NOW - 30 * MINUTE + 37_412
  const { answer, played, dose, showing } = await playDose(page, occurredAt)
  await answer("**/api/doses/dose-1", () => {
    showing({ ...dose, version: 2 })
    return { status: 200, json: { dose: { ...dose, version: 2 }, changed: [["today"]] } }
  })
  const sheet = await openTheDose(page)
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect.poll(() => played.sent.map(({ body }) => body.occurredAt)).toEqual([occurredAt])
})

test("deletes a dose after asking, then puts it back with Undo", async ({ page }) => {
  const { answer, played, dose, showing } = await playDose(page)
  await answer("**/api/doses/dose-1", () => {
    showing(null)
    return { status: 200, json: { dose: { ...dose, version: 2, deletedAt: NOW }, changed: [["today"], ["deleted"]] } }
  })
  await answer("**/api/doses/dose-1/restore", () => {
    showing({ ...dose, version: 3 })
    return { status: 200, json: { dose: { ...dose, version: 3 }, changed: [["today"], ["deleted"]] } }
  })
  const sheet = await openTheDose(page)
  await sheet.getByRole("button", { name: "Delete dose" }).click()
  await expect(sheet).toContainText("Delete this dose?")
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole("list", { name: "Supplements" })).toContainText("Vitamin D not logged yet today")
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click()
  await expect
    .poll(() => played.sent.map(({ method, path, body }) => [method, path, body.version]))
    .toEqual([
      ["DELETE", "/api/doses/dose-1", 1],
      ["POST", "/api/doses/dose-1/restore", 2],
    ])
  await expect(page.getByRole("list", { name: "Supplements" })).toContainText("Vitamin D logged at 9:00")
})

test("says who changed the dose first, and saves mine on top of theirs when asked", async ({ page }) => {
  const { answer, played, dose, emily, showing } = await playDose(page)
  const theirs = { ...dose, occurredAt: NOW - 45 * MINUTE, version: 2, updatedBy: emily.id }
  await answer("**/api/doses/dose-1", ({ body }) => {
    if (body.version === 1) return { status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } }
    const mine = { ...theirs, occurredAt: body.occurredAt ?? NOW, version: 3 }
    showing(mine)
    return { status: 200, json: { dose: mine, changed: [["today"]] } }
  })
  const sheet = await openTheDose(page)
  await sheet.getByLabel("When").fill("2026-10-09T08:15")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Emily (local) changed this a moment ago.")
  await sheet.getByRole("button", { name: "Save mine anyway" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => [body.version, body.occurredAt]))
    .toEqual([
      [1, NOW - 75 * MINUTE],
      [2, NOW - 75 * MINUTE],
    ])
})

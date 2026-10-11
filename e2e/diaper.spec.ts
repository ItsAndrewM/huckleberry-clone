import { expect, type Locator, type Page, test } from "@playwright/test"
import { caregiversOf, MINUTE, NOW, openToday, playHousehold, type Sent, todayWith } from "./played-household.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)

test.use({ timezoneId: "Europe/London" })

const tapper = () => {
  let taps = 0
  const tap = async (target: Locator) => {
    taps += 1
    await target.click()
  }
  return { tap, taps: () => taps }
}

const quickAction = (page: Page, name: string) =>
  page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name })

const playDiapers = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const household = await playHousehold(page, todayWith())
  const saved = ({ body }: Sent, deletedAt: number | null, version: number) => ({
    id: "diaper-1",
    occurredAt: body.occurredAt ?? NOW,
    wet: body.wet ?? true,
    dirty: body.dirty ?? false,
    version,
    createdBy: andrew.id,
    createdAt: NOW,
    updatedBy: andrew.id,
    updatedAt: NOW,
    deletedAt,
  })
  await household.answer("**/api/diapers", (sent) => {
    const diaper = saved(sent, null, 1)
    household.played.today = { ...household.played.today, recent: [{ kind: "diaper", diaper }] }
    return { status: 201, json: { diaper, changed: [["today"], ["last24h"]] } }
  })
  await household.answer("**/api/diapers/diaper-1", (sent) => {
    household.played.today = todayWith()
    return { status: 200, json: { diaper: saved(sent, NOW, 2), changed: [["today"], ["last24h"], ["deleted"]] } }
  })
  return household.played
}

test("logs a diaper in two taps from Today, and lists it", async ({ page }) => {
  const played = await playDiapers(page)
  await openToday(page)
  const { tap, taps } = tapper()
  await tap(quickAction(page, "Diaper"))
  await tap(page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Pee" }))
  expect(taps()).toBe(2)
  await expect
    .poll(() => played.sent)
    .toEqual([
      { method: "POST", path: "/api/diapers", body: { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false } },
    ])
  await expect(page.getByRole("list", { name: "Last 24 hours" })).toContainText("Pee")
  await expect(page.getByRole("status").filter({ hasText: "Diaper saved" })).toBeVisible()
})

test("undoes the diaper just saved, with the version the household answered", async ({ page }) => {
  const played = await playDiapers(page)
  await openToday(page)
  await quickAction(page, "Diaper").click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Poo" }).click()
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click()
  await expect
    .poll(() => played.sent.map(({ method, path, body }) => [method, path, body.version]))
    .toEqual([
      ["POST", "/api/diapers", undefined],
      ["DELETE", "/api/diapers/diaper-1", 1],
    ])
  await expect(page.getByText("Nothing logged in the last 24 hours.")).toBeVisible()
})

test("lets the Undo go after five seconds", async ({ page }) => {
  await playDiapers(page)
  await page.clock.install({ time: NOW })
  await page.goto("/")
  await quickAction(page, "Diaper").click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Pee" }).click()
  const undo = page.getByRole("status").getByRole("button", { name: "Undo" })
  await expect(undo).toBeVisible()
  await page.clock.runFor(4_000)
  await expect(undo).toBeVisible()
  await page.clock.runFor(1_000)
  await expect(undo).toBeHidden()
})

test("logs a diaper at the time picked, read on the household's clock", async ({ page }) => {
  const played = await playDiapers(page)
  await openToday(page)
  await quickAction(page, "Diaper").click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("When").fill("2026-10-09T08:50")
  await sheet.getByRole("button", { name: "Both" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => [body.occurredAt, body.wet, body.dirty]))
    .toEqual([[NOW - 40 * MINUTE, true, true]])
})

test("saves a diaper to the household itself, which lists it", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Totals")).toBeVisible()
  await quickAction(page, "Diaper").click()
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/diapers"))
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Both" }).click()
  const response = await saved
  expect(response.status()).toBe(201)
  const { diaper } = await response.json()
  const entry = page
    .getByRole("listitem")
    .filter({ has: page.locator(`time[datetime="${new Date(diaper.occurredAt).toISOString()}"]`) })
  await expect(entry).toContainText("Pee and poo")
})

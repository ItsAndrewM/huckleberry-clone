import { expect, type Locator, type Page, test } from "@playwright/test"
import {
  caregiversOf,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  savedBy,
  type Sent,
  todayWith,
} from "./played-household.ts"

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

const gate = () => {
  let open = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

const holdRequests = async (page: Page, pattern: string, until: () => Promise<void>) => {
  const held: string[] = []
  await page.route(pattern, async (route) => {
    held.push(route.request().url())
    await until()
    await route.fallback()
  })
  return held
}

const playDiapers = async (page: Page, failures = 0) => {
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
  let saves = 0
  await household.answer("**/api/diapers", (sent) => {
    saves += 1
    if (saves <= failures) return { status: 500, json: {} }
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

test("a failed save rolls Today back and reloads it, reopens the sheet, and an edited resave keeps its actionId", async ({
  page,
}) => {
  const played = await playDiapers(page, 1)
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  const diapers = page.locator("dl > div").filter({ hasText: "Diapers" })
  const before = await diapers.innerText()
  await holdRequests(page, "**/api/diapers", () => sheet.waitFor({ state: "hidden" }))
  const reload = gate()
  const reloads = await holdRequests(page, "**/api/today", () => reload.opened)
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Poo" }).click()
  await expect(page.getByText("Saving…")).toBeVisible()
  await expect(sheet.getByRole("alert")).toContainText("Not saved.")
  await expect(sheet.getByRole("alert")).toBeInViewport({ ratio: 1 })
  await expect(sheet.getByRole("button", { name: "Try again" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Try again" })).toBeInViewport({ ratio: 1 })
  await expect(sheet.getByLabel("When")).toHaveValue("2026-10-09T09:30")
  await expect(page.getByText("Saving…")).toHaveCount(0)
  await expect.poll(() => diapers.innerText()).toBe(before)
  await expect.poll(() => reloads.length).toBeGreaterThan(0)
  const reloaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/today")
  reload.open()
  await reloaded
  await sheet.getByRole("button", { name: "Both" }).click()
  await expect.poll(() => played.sent).toHaveLength(2)
  const [first, second] = played.sent.map(({ body }) => body)
  expect(first).toEqual({ actionId: ACTION_ID, occurredAt: NOW, wet: false, dirty: true })
  expect(second).toEqual({ ...first, wet: true, dirty: true })
})

test("a failed save answered while the sheet is still closing reopens it sized to its note, in view", async ({
  page,
}) => {
  await playDiapers(page, 1)
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Poo" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Not saved.")
  await expect(sheet.getByRole("alert")).toBeInViewport({ ratio: 1 })
  await expect(sheet.getByRole("button", { name: "Try again" })).toBeInViewport({ ratio: 1 })
})

test("saves the changes to a diaper whose first save had landed, as an edit of that diaper", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const household = await playHousehold(page, todayWith())
  const first = { id: "diaper-1", occurredAt: NOW, wet: true, dirty: false, ...savedBy(andrew.id) }
  const posted: Sent["body"][] = []
  await page.route("**/api/diapers", (route) => {
    posted.push(route.request().postDataJSON())
    if (posted.length > 1) {
      return route.fulfill({ status: 409, json: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first } })
    }
    household.played.today = { ...todayWith(), recent: [{ kind: "diaper", diaper: first }] }
    return route.abort("internetdisconnected")
  })
  await household.answer("**/api/diapers/diaper-1", ({ body }) => {
    const diaper = { ...first, wet: body.wet ?? true, dirty: body.dirty ?? false, version: 2 }
    household.played.today = { ...todayWith(), recent: [{ kind: "diaper", diaper }] }
    return { status: 200, json: { diaper, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Both" }).click()
  const note = sheet.getByRole("alert")
  await expect(note.getByText("This was already saved as you first entered it.")).toBeVisible()
  await note.getByRole("button", { name: "Save my changes" }).click()
  await expect(sheet).toBeHidden()
  expect(posted).toEqual([
    { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false },
    { actionId: posted[0]?.actionId, occurredAt: NOW, wet: true, dirty: true },
  ])
  expect(household.played.sent).toEqual([
    {
      method: "PATCH",
      path: "/api/diapers/diaper-1",
      body: { actionId: ACTION_ID, version: 1, occurredAt: NOW, wet: true, dirty: true },
    },
  ])
  expect(household.played.sent[0]?.body.actionId).not.toBe(posted[0]?.actionId)
  await expect(page.getByRole("list", { name: "Last 24 hours" })).toContainText("Pee and poo")
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

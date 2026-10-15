import type { BrowserContext, Page } from "@playwright/test"
import { NOW, playHousehold, todayWith } from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ serviceWorkers: "allow" })

const MINUTE = 60_000
const ZONE = "America/Vancouver"

const openWithSavedCopy = async (page: Page) => {
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await expect.poll(() => page.evaluate<boolean>("navigator.serviceWorker.controller !== null")).toBe(true)
}

const goOfflineLikeAPhone = async (page: Page, context: BrowserContext) => {
  await page.routeWebSocket(/\/api\/ws$/, (socket) => socket.close({ code: 1011, reason: "offline" }))
  await context.setOffline(true)
}

const localMinute = (instant: number) => {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  )
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}`
}

const diapersAt = async (page: Page, occurredAt: number) => {
  const today = await (await page.request.get("/api/today")).json()
  return today.recent.filter(
    (entry: { kind: string; diaper?: { occurredAt: number } }) =>
      entry.kind === "diaper" && entry.diaper?.occurredAt === occurredAt,
  )
}

test("keeps a diaper logged offline in its sheet, and Try again saves it to the household once (AC 11)", async ({
  page,
  context,
}) => {
  const minute = Date.now() - (5 + Math.floor(Math.random() * 1380)) * MINUTE
  const occurredAt = minute - (minute % MINUTE)
  await openWithSavedCopy(page)
  const before = (await diapersAt(page, occurredAt)).length
  await goOfflineLikeAPhone(page, context)
  await expect(page.getByRole("alert").filter({ hasText: "No connection" })).toBeVisible()
  await expect(page.getByText("Totals")).toBeVisible()
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Diaper" }).click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("When").fill(localMinute(occurredAt))
  await sheet.getByRole("button", { name: "Poo" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection. This is kept on this phone:")
  await context.setOffline(false)
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(async () => (await diapersAt(page, occurredAt)).length).toBe(before + 1)
})

test("tries again with the actionId of the attempt that failed, so the household's receipt can answer a repeat", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "only Chromium lets page.route see the page's requests while its worker runs")
  const { played } = await playHousehold(page, todayWith())
  let offline = false
  const actionIds: unknown[] = []
  await page.route("**/api/diapers", async (route) => {
    actionIds.push(route.request().postDataJSON()?.actionId)
    if (offline) return route.abort("internetdisconnected")
    const diaper = { id: "d1", occurredAt: NOW, wet: true, dirty: false, version: 1, deletedAt: null }
    const answer = { ...diaper, createdBy: "x", createdAt: NOW, updatedBy: "x", updatedAt: NOW }
    played.today = { ...played.today, recent: [{ kind: "diaper", diaper: answer }] }
    return route.fulfill({ status: 201, json: { diaper: answer, changed: [["today"]] } })
  })
  await page.clock.setFixedTime(NOW)
  await openWithSavedCopy(page)
  offline = true
  await goOfflineLikeAPhone(page, context)
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Diaper" }).click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  offline = false
  await context.setOffline(false)
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("list", { name: "Last 24 hours" })).toContainText("Pee")
  await expect.poll(() => actionIds.length).toBe(2)
  expect(actionIds[1]).toBe(actionIds[0])
})

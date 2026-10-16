import type { Locator, Page } from "@playwright/test"
import { expect, test } from "./test.ts"

const NOW = Date.UTC(2026, 9, 9, 16, 30)
const MINUTE = 60_000
const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const RECORD_ROUTE = /\/api\/(diapers|feeds|growth|sleeps|doses)\/[^/]+(\/restore)?$/u

interface Audit {
  readonly version: number
  readonly createdBy: string
  readonly createdAt: number
  readonly updatedBy: string
  readonly updatedAt: number
  readonly deletedAt: number | null
}

interface Diaper extends Audit {
  readonly id: string
  readonly occurredAt: number
  readonly wet: boolean
  readonly dirty: boolean
}

interface Feed extends Audit {
  readonly id: string
  readonly status: "active" | "completed"
  readonly startedAt: number
  readonly endedAt: number | null
  readonly segments: ReadonlyArray<object>
  readonly portions: ReadonlyArray<object>
}

interface Measurement extends Audit {
  readonly id: string
  readonly measuredAt: number
  readonly weightG: number | null
  readonly lengthCm: number | null
  readonly headCm: number | null
}

interface Sleep extends Audit {
  readonly id: string
  readonly kind: "nap" | "night"
  readonly startedAt: number
  readonly endedAt: number | null
}

interface Dose extends Audit {
  readonly id: string
  readonly supplementId: string
  readonly occurredAt: number
  readonly localDate: string
  readonly dose: string
}

interface Deleted {
  readonly feeds: ReadonlyArray<Feed>
  readonly diapers: ReadonlyArray<Diaper>
  readonly sleeps: ReadonlyArray<Sleep>
  readonly measurements: ReadonlyArray<Measurement>
  readonly doses: ReadonlyArray<Dose>
}

interface Sent {
  readonly method: string
  readonly path: string
  readonly body: { readonly actionId: string; readonly version: number }
}

type Changed = ReadonlyArray<ReadonlyArray<string>>

type Answer =
  | { readonly diaper: Diaper; readonly changed: Changed }
  | { readonly measurement: Measurement; readonly changed: Changed }
  | { readonly sleep: Sleep; readonly changed: Changed }
  | { readonly dose: Dose; readonly changed: Changed }
  | { readonly _tag: "Conflict"; readonly code: "FEED_ALREADY_ACTIVE"; readonly current: Feed }
  | {
      readonly _tag: "InvalidInput"
      readonly fieldErrors: ReadonlyArray<{ readonly path: string; readonly issue: string }>
    }
  | { readonly _tag: "ServiceUnavailable" }

const NOTHING: Deleted = { feeds: [], diapers: [], sleeps: [], measurements: [], doses: [] }

const deletedBy = (by: string, at: number, version = 2): Audit => ({
  version,
  createdBy: by,
  createdAt: at - 30 * MINUTE,
  updatedBy: by,
  updatedAt: at,
  deletedAt: at,
})

const diaper = (audit: Audit): Diaper => ({
  id: "diaper-1",
  occurredAt: NOW - 50 * MINUTE,
  wet: true,
  dirty: false,
  ...audit,
})

const bottle = (audit: Audit): Feed => ({
  id: "feed-1",
  status: "completed",
  startedAt: NOW - 90 * MINUTE,
  endedAt: NOW - 90 * MINUTE,
  segments: [],
  portions: [{ id: "portion-1", occurredAt: NOW - 90 * MINUTE, breastMilkMl: 90, formulaMl: 30 }],
  ...audit,
})

const runningFeed = (id: string, startedAt: number, audit: Audit): Feed => ({
  id,
  status: "active",
  startedAt,
  endedAt: null,
  segments: [{ id: `${id}-segment`, side: "left", startedAt, endedAt: null }],
  portions: [],
  ...audit,
})

const weighed = (audit: Audit): Measurement => ({
  id: "m1",
  measuredAt: NOW - 120 * MINUTE,
  weightG: 4210.5,
  lengthCm: null,
  headCm: 37.5,
  ...audit,
})

const nap = (audit: Audit): Sleep => ({
  id: "sleep-1",
  kind: "nap",
  startedAt: NOW - 150 * MINUTE,
  endedAt: NOW - 70 * MINUTE,
  ...audit,
})

const vitaminDOf = async (page: Page): Promise<string> => {
  const me = await (await page.request.get("/api/me")).json()
  return me.household.supplements.find(({ name }: { name: string }) => name === "Vitamin D").id
}

const dosed = (supplementId: string, audit: Audit, dose = "400 IU"): Dose => ({
  id: "dose-1",
  supplementId,
  occurredAt: NOW - 150 * MINUTE,
  localDate: "2026-10-09",
  dose,
  ...audit,
})

const supplementOf = (id: string, name: string) => ({
  id,
  name,
  dose: "400 IU",
  stoppedAt: null,
  version: 1,
  createdBy: null,
  createdAt: NOW,
  updatedBy: null,
  updatedAt: NOW,
})

const playDeleted = async (
  page: Page,
  entries: (andrew: string, emily: string) => Deleted,
  added: ReadonlyArray<ReturnType<typeof supplementOf>> = [],
) => {
  const me = await (await page.request.get("/api/me")).json()
  const [andrew, emily] = me.household.caregivers
  const household = {
    ...me.household,
    supplements: [...me.household.supplements, ...added],
    timeZone: "America/Vancouver",
    units: { volume: "ml", weight: "kg", length: "cm" },
  }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household } }))
  const sent: Sent[] = []
  const played = { deleted: entries(andrew.id, emily.id), sent }
  await page.route("**/api/deleted", (route) => route.fulfill({ json: played.deleted }))
  const answer = (status: number, json: Answer, after = played.deleted) =>
    page.route(RECORD_ROUTE, (route) => {
      const request = route.request()
      played.sent.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      })
      played.deleted = after
      return route.fulfill({ status, json })
    })
  return { played, answer, andrew: andrew.id, emily: emily.id }
}

const openDeleted = async (page: Page) => {
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings/deleted")
  await page.getByRole("heading", { name: "Recently deleted", level: 1 }).waitFor()
}

const entries = (page: Page) => page.getByRole("list", { name: "Deleted entries" })

test("opens from Settings with the Settings tab still lit, and goes back", async ({ page }) => {
  await playDeleted(page, () => NOTHING)
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings")
  await page.getByRole("link", { name: "See deleted entries" }).click()
  await expect(page.getByRole("heading", { name: "Recently deleted", level: 1 })).toBeVisible()
  await expect(page.getByText("Nothing was deleted in the last 30 days.")).toBeVisible()
  const tabs = page.getByRole("navigation", { name: "Main" })
  await expect(tabs.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page")
  await page.locator("header").getByRole("link", { name: "Settings" }).click()
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible()
})

test("lists each deleted entry, newest deletion first, with when it happened and who deleted it", async ({ page }) => {
  await playDeleted(page, (andrew, emily) => ({
    feeds: [bottle(deletedBy(emily, NOW - 30 * MINUTE))],
    diapers: [diaper(deletedBy(andrew, NOW - 5 * MINUTE))],
    sleeps: [],
    measurements: [weighed(deletedBy(emily, NOW - 20 * MINUTE))],
    doses: [],
  }))
  await openDeleted(page)
  const rows = entries(page).getByRole("listitem")
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText("Diaper")
  await expect(rows.nth(0)).toContainText("Pee")
  await expect(rows.nth(0)).toContainText(/Fri, Oct 9(,| at) 8:40\sAM/u)
  await expect(rows.nth(0)).toContainText("Deleted by Andrew (local)")
  await expect(rows.nth(1)).toContainText("Weight 4.21 kg · Head 37.5 cm")
  await expect(rows.nth(1)).toContainText("Deleted by Emily (local)")
  await expect(rows.nth(2)).toContainText("Bottle")
  await expect(rows.nth(2)).toContainText("120 mL")
})

test("restores a diaper off the list, and its Undo for five seconds deletes it again", async ({ page }) => {
  const { played, answer, andrew } = await playDeleted(page, (andrew) => ({
    ...NOTHING,
    diapers: [diaper(deletedBy(andrew, NOW - 5 * MINUTE))],
  }))
  await openDeleted(page)
  const restored = { ...diaper(deletedBy(andrew, NOW, 3)), deletedAt: null }
  await answer(200, { diaper: restored, changed: [["today"], ["last24h"], ["deleted"]] }, NOTHING)
  await page.getByRole("button", { name: /^Restore Diaper/u }).click()
  await expect(page.getByText("Nothing was deleted in the last 30 days.")).toBeVisible()
  const toast = page.locator("output").filter({ hasText: "Diaper restored" })
  await expect(toast).toBeVisible()
  const deletedAgain = diaper(deletedBy(andrew, NOW, 4))
  await answer(200, { diaper: deletedAgain, changed: [["deleted"]] }, { ...NOTHING, diapers: [deletedAgain] })
  await toast.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByRole("button", { name: /^Restore Diaper/u })).toBeVisible()
  await answer(200, { diaper: { ...deletedAgain, version: 5, deletedAt: null }, changed: [["deleted"]] }, NOTHING)
  await page.getByRole("button", { name: /^Restore Diaper/u }).click()
  await expect(page.getByText("Nothing was deleted in the last 30 days.")).toBeVisible()
  expect(played.sent).toEqual([
    { method: "POST", path: "/api/diapers/diaper-1/restore", body: { actionId: ACTION_ID, version: 2 } },
    { method: "DELETE", path: "/api/diapers/diaper-1", body: { actionId: ACTION_ID, version: 3 } },
    { method: "POST", path: "/api/diapers/diaper-1/restore", body: { actionId: ACTION_ID, version: 4 } },
  ])
  expect(played.sent[2]?.body.actionId).not.toBe(played.sent[0]?.body.actionId)
})

test("tries a restore the household couldn't take again under the same actionId, so it can't restore twice", async ({
  page,
}) => {
  const { played, answer, andrew } = await playDeleted(page, (andrew) => ({
    ...NOTHING,
    diapers: [diaper(deletedBy(andrew, NOW - 5 * MINUTE))],
  }))
  await openDeleted(page)
  await answer(503, { _tag: "ServiceUnavailable" })
  await page.getByRole("button", { name: /^Restore Diaper/u }).click()
  await expect(entries(page).getByRole("alert")).toHaveText("Not restored. Try again.")
  const restored = { ...diaper(deletedBy(andrew, NOW, 3)), deletedAt: null }
  await answer(200, { diaper: restored, changed: [["deleted"]] }, NOTHING)
  await page.getByRole("button", { name: /^Restore Diaper/u }).click()
  await expect(page.getByText("Nothing was deleted in the last 30 days.")).toBeVisible()
  expect(played.sent.map(({ body }) => body)).toEqual([
    { actionId: ACTION_ID, version: 2 },
    { actionId: ACTION_ID, version: 2 },
  ])
  expect(played.sent[1]?.body.actionId).toBe(played.sent[0]?.body.actionId)
})

test("says a feed still running when it was deleted can't come back over a feed started since, without asking to finish that one", async ({
  page,
}) => {
  const { answer, emily } = await playDeleted(page, (andrew) => ({
    ...NOTHING,
    feeds: [runningFeed("feed-1", NOW - 60 * MINUTE, deletedBy(andrew, NOW - 55 * MINUTE))],
  }))
  await openDeleted(page)
  await expect(entries(page).getByRole("listitem")).toContainText("Running when deleted")
  const other = runningFeed("feed-2", NOW - 25 * MINUTE, { ...deletedBy(emily, NOW - 25 * MINUTE, 1), deletedAt: null })
  await answer(409, { _tag: "Conflict", code: "FEED_ALREADY_ACTIVE", current: other })
  await page.getByRole("button", { name: /^Restore Nursing/u }).click()
  await expect(entries(page).getByRole("alert")).toHaveText(
    "It was still running when it was deleted, so it would run on over the feed Emily (local) started at 9:05 AM. It can't come back.",
  )
  await expect(entries(page).getByRole("listitem")).toContainText("Running when deleted")
})

test("refuses an entry from before her birth date, saying why", async ({ page }) => {
  const { answer } = await playDeleted(page, (andrew) => ({
    ...NOTHING,
    diapers: [diaper(deletedBy(andrew, NOW - 5 * MINUTE))],
  }))
  await openDeleted(page)
  await answer(400, { _tag: "InvalidInput", fieldErrors: [{ path: "occurredAt", issue: "before_birth" }] })
  await page.getByRole("button", { name: /^Restore Diaper/u }).click()
  await expect(entries(page).getByRole("alert")).toHaveText("That's before Robin was born.")
})

test("restores a measurement with no Undo, since its card can delete it", async ({ page }) => {
  const { answer, emily } = await playDeleted(page, (_andrew, emily) => ({
    ...NOTHING,
    sleeps: [],
    measurements: [weighed(deletedBy(emily, NOW - 5 * MINUTE))],
  }))
  await openDeleted(page)
  const restored = { ...weighed(deletedBy(emily, NOW, 3)), deletedAt: null }
  await answer(200, { measurement: restored, changed: [["growth"], ["deleted"]] }, NOTHING)
  await page.getByRole("button", { name: /^Restore Measurement/u }).click()
  const toast = page.locator("output").filter({ hasText: "Measurement restored" })
  await expect(toast).toBeVisible()
  await expect(toast.getByRole("button", { name: "Undo" })).toHaveCount(0)
})

test("restores a dose by its supplement's name, then Undo deletes it again", async ({ page }) => {
  const vitaminD = await vitaminDOf(page)
  const { answer, played, emily } = await playDeleted(page, (_andrew, emily) => ({
    ...NOTHING,
    doses: [dosed(vitaminD, deletedBy(emily, NOW - 5 * MINUTE))],
  }))
  await openDeleted(page)
  await expect(entries(page).getByRole("listitem")).toContainText(["Vitamin D"])
  const restored = { ...dosed(vitaminD, deletedBy(emily, NOW, 3)), deletedAt: null }
  await answer(200, { dose: restored, changed: [["today"], ["deleted"]] }, NOTHING)
  await page.getByRole("button", { name: /^Restore Vitamin D/u }).click()
  const toast = page.locator("output").filter({ hasText: "Dose restored" })
  await toast.getByRole("button", { name: "Undo" }).click()
  await expect
    .poll(() => played.sent.map(({ method, path, body }) => [method, path, body.version]))
    .toEqual([
      ["POST", "/api/doses/dose-1/restore", 2],
      ["DELETE", "/api/doses/dose-1", 3],
    ])
})

const LONGEST = [
  {
    written: "with spaces",
    name: "Cholecalciferol (vitamin D3) liquid drops for infants, 400IU",
    given: "1 dropperful each morning with breakfast",
  },
  { written: "with no spaces", name: "Multivitamin".repeat(5), given: "W".repeat(40) },
]

const spillsOut = (target: Locator) => target.evaluate((element) => element.scrollWidth > element.clientWidth)
const widthOfPage = (page: Page) => page.locator("html").evaluate((root) => root.scrollWidth)

for (const { written, name, given } of LONGEST) {
  test(`wraps a deleted dose's longest name and dose ${written} instead of running off its row on a 360-pixel-wide phone`, async ({
    page,
  }) => {
    expect([name.length, given.length]).toEqual([60, 40])
    const longest = supplementOf("supplement-long", name)
    await page.setViewportSize({ width: 360, height: 900 })
    await playDeleted(
      page,
      (_andrew, emily) => ({ ...NOTHING, doses: [dosed(longest.id, deletedBy(emily, NOW - 5 * MINUTE), given)] }),
      [longest],
    )
    await openDeleted(page)
    const row = entries(page).getByRole("listitem")
    await expect(row).toHaveCount(1)
    expect(await widthOfPage(page)).toBeLessThanOrEqual(360)
    expect(await spillsOut(entries(page))).toBe(false)
    expect(await spillsOut(row.getByText(name))).toBe(false)
    expect(await spillsOut(row.getByText(given).locator("xpath=.."))).toBe(false)
  })
}

test("waits with a reason while there's no connection", async ({ page, context }) => {
  await playDeleted(page, (andrew) => ({ ...NOTHING, diapers: [diaper(deletedBy(andrew, NOW - 5 * MINUTE))] }))
  await openDeleted(page)
  await expect(page.getByRole("button", { name: /^Restore Diaper/u })).toBeEnabled()
  await context.setOffline(true)
  await expect(page.getByText("Restoring needs a connection.")).toBeVisible()
  await expect(page.getByRole("button", { name: /^Restore Diaper/u })).toBeDisabled()
})

test("restores a deleted nap with a tap, offering Undo", async ({ page }) => {
  const { played, answer, emily } = await playDeleted(page, (_andrew, deleter) => ({
    ...NOTHING,
    sleeps: [nap(deletedBy(deleter, NOW - 5 * MINUTE))],
  }))
  await answer(200, { sleep: { ...nap(deletedBy(emily, NOW, 3)), deletedAt: null }, changed: [["deleted"]] }, NOTHING)
  await openDeleted(page)
  await expect(entries(page)).toContainText("Nap")
  await expect(entries(page)).toContainText("1 h 20 min")
  await page.getByRole("button", { name: /^Restore Nap/u }).click()
  await expect(page.getByText("Sleep restored")).toBeVisible()
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible()
  expect(played.sent).toEqual([
    { method: "POST", path: "/api/sleeps/sleep-1/restore", body: { actionId: ACTION_ID, version: 2 } },
  ])
})

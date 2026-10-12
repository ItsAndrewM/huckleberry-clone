import { expect, type Page, test } from "@playwright/test"
import {
  caregiversOf,
  gate,
  holdRequests,
  loseSaves,
  MINUTE,
  muteLiveUpdates,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  savedDiaper,
  todayWith,
} from "./played-household.ts"

const HOUR = 3_600_000
const KEPT_ACTION_ID = "6f1d2c3b-4a5e-4b6c-8d7e-9f0a1b2c3d4e"

const keptDiaper = (keptAt: number) => [
  {
    sending: {
      sheet: "diaper",
      action: { kind: "logDiaper", payload: { actionId: KEPT_ACTION_ID, occurredAt: keptAt, wet: false, dirty: true } },
    },
    keptAt,
    idSince: keptAt,
    failed: true,
  },
]

const keepOnArrival = (page: Page, entries: ReturnType<typeof keptDiaper>) =>
  page.addInitScript((stored) => localStorage.setItem("bt.kept", stored), JSON.stringify(entries))

const failDiaperOffline = async (page: Page, choice: string) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const sent = await loseSaves(page, "**/api/diapers", {
    lost: 1,
    until: Promise.resolve(),
    answer: savedDiaper(andrew.id),
  })
  await muteLiveUpdates(page)
  await openToday(page)
  await quickAction(page, "Diaper").click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: choice }).click()
  return sent
}

test("keeps a diaper that failed with no connection through a reload, and asks before saving it under its actionId", async ({
  page,
}) => {
  const sent = await failDiaperOffline(page, "Poo")
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await expect(sheet.getByRole("alert")).toContainText("No connection. This is kept on this phone:")
  await page.reload()
  await expect(sheet.getByRole("alert")).toHaveText(/^This wasn't saved, Fri 9:30\sAM\. Save it now\?Save now$/u)
  expect(sent).toHaveLength(1)
  await sheet.getByRole("button", { name: "Save now" }).click()
  await expect(page.getByText("Diaper saved")).toBeVisible()
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
  await page.reload()
  await page.getByText("Totals").waitFor()
  await expect(sheet).toBeHidden()
  expect(sent).toHaveLength(2)
})

test("asks about a diaper still on its way when iOS closed the app, allowing that it may have been saved", async ({
  context,
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const sent: Array<{ actionId: string }> = []
  await playHousehold(page, todayWith())
  await page.route("**/api/diapers", (route) => {
    sent.push(route.request().postDataJSON())
  })
  await muteLiveUpdates(page)
  await openToday(page)
  await quickAction(page, "Diaper").click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Pee" }).click()
  await expect(page.getByText("Saving…")).toBeVisible()
  await page.close()
  const reopened = await context.newPage()
  await playHousehold(reopened, todayWith())
  await reopened.route("**/api/diapers", (route) => {
    const body = route.request().postDataJSON()
    sent.push(body)
    return route.fulfill({ status: 201, json: savedDiaper(andrew.id)(body) })
  })
  await openToday(reopened)
  const sheet = reopened.getByRole("dialog", { name: "Diaper" })
  await expect(sheet.getByRole("alert")).toHaveText(
    /^This might not have been saved, Fri 9:30\sAM\. Save it now\?Save now$/u,
  )
  await sheet.getByRole("button", { name: "Save now" }).click()
  await expect(reopened.getByText("Diaper saved")).toBeVisible()
  expect(sent.map(({ actionId }) => actionId)).toEqual([sent[0]?.actionId, sent[0]?.actionId])
})

test("saves an entry kept 12 hours or more under a new actionId, once asked", async ({ page }) => {
  await keepOnArrival(page, keptDiaper(NOW - 13 * HOUR))
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const sent = await loseSaves(page, "**/api/diapers", {
    lost: 0,
    until: Promise.resolve(),
    answer: savedDiaper(andrew.id),
  })
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await expect(sheet.getByRole("alert")).toHaveText(/^This wasn't saved, Thu 8:30\sPM\. Save it now\?Save now$/u)
  await sheet.getByRole("button", { name: "Save now" }).click()
  await expect.poll(() => sent).toHaveLength(1)
  expect(sent[0]?.actionId).not.toBe(KEPT_ACTION_ID)
  expect(sent[0]).toMatchObject({ occurredAt: NOW - 13 * HOUR, wet: false, dirty: true })
})

test("lets a kept entry go for good once it's discarded", async ({ page }) => {
  const sent = await failDiaperOffline(page, "Pee")
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await page.reload()
  await expect(sheet.getByRole("alert")).toContainText("This wasn't saved")
  await page.keyboard.press("Escape")
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect(sheet).toBeHidden()
  await page.reload()
  await page.getByText("Totals").waitFor()
  await expect(sheet).toBeHidden()
  expect(sent).toHaveLength(1)
})

test("lets a start go for good once it meets the other phone's running feed", async ({ page }) => {
  const { emily } = await caregiversOf(page)
  const theirs = runningFeed(emily.id, NOW - 5 * MINUTE, "right")
  const { played, answer } = await playHousehold(page, todayWith())
  await answer("**/api/feeds/start", () => {
    played.today = todayWith(theirs)
    return { status: 409, json: { _tag: "Conflict", code: "FEED_ALREADY_ACTIVE", current: theirs } }
  })
  await muteLiveUpdates(page)
  await openToday(page)
  await quickAction(page, "Nursing").click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await sheet.getByRole("button", { name: "Left", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("started a feed at")
  expect(await page.evaluate(() => localStorage.getItem("bt.kept"))).toBeNull()
  await page.reload()
  await page.getByText("Totals").waitFor()
  await expect(sheet).toBeHidden()
})

test("waits for Today to load before asking about a kept diaper", async ({ page }) => {
  await keepOnArrival(page, keptDiaper(NOW - HOUR))
  await playHousehold(page, todayWith())
  const today = gate()
  const held = await holdRequests(page, "**/api/today", () => today.opened)
  await page.clock.setFixedTime(NOW)
  const me = page.waitForResponse("**/api/me")
  await page.goto("/")
  await me
  await expect.poll(() => held.length).toBeGreaterThan(0)
  await expect(page.getByText("Logging opens once Today loads.")).toBeVisible()
  await expect(page.getByRole("dialog", { name: "Diaper" })).toHaveCount(0)
  today.open()
  await expect(page.getByRole("dialog", { name: "Diaper" }).getByRole("alert")).toContainText("This wasn't saved")
})

test("asks to keep the app open when the phone won't keep the entry", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
    }
  })
  await failDiaperOffline(page, "Pee")
  await expect(page.getByRole("dialog", { name: "Diaper" }).getByRole("alert")).toContainText(
    "No connection. Keep the app open, and try again once you're back online.",
  )
})

test("asks about a measurement kept through a reload, on Growth", async ({ page }) => {
  await page.route(/\/api\/growth$/u, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { measurements: [] } })
      : route.abort("internetdisconnected"),
  )
  await page.clock.setFixedTime(NOW)
  await page.goto("/growth")
  await page.getByRole("button", { name: "Add measurement" }).click()
  const sheet = page.getByRole("dialog", { name: "Add measurement" })
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4.5")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection. This is kept on this phone:")
  await page.reload()
  await expect(sheet.getByRole("alert")).toContainText("This wasn't saved")
  await expect(sheet.getByRole("textbox", { name: "Weight" })).toHaveValue("4.5")
})

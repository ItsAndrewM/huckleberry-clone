import type { Locator, Page } from "@playwright/test"
import {
  caregiversOf,
  gate,
  loseSaves,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  runningSleep,
  savedDiaper,
  sleepingToday,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "Europe/London" })

const FIRST_TAP = NOW + 37_000
const OPENED_AGAIN = FIRST_TAP + 2 * MINUTE
const STARTED = NOW - 40 * MINUTE

const openSheet = async (page: Page, action: string): Promise<Locator> => {
  await quickAction(page, action).click()
  return page.getByRole("dialog", { name: action })
}

test("a diaper whose send fails after its sheet was opened again saves that first tap, not a second diaper", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const answer = gate()
  const bodies = await loseSaves(page, "**/api/diapers", {
    lost: 1,
    until: answer.opened,
    answer: savedDiaper(andrew.id),
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Diaper")
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet).toBeHidden()
  await page.clock.setFixedTime(OPENED_AGAIN)
  await openSheet(page, "Diaper")
  await expect(sheet.getByRole("button", { name: "Pee" })).toBeVisible()
  answer.open()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]?.actionId).toBe(bodies[0]?.actionId)
  expect(bodies[1]?.occurredAt).toBe(FIRST_TAP)
  await expect(sheet).toBeHidden()
})

test("a wake whose send fails after the Sleep sheet was opened again saves the first tap's time", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const sleep = runningSleep(andrew.id, STARTED)
  await playHousehold(page, sleepingToday(sleep))
  const answer = gate()
  const bodies = await loseSaves(page, "**/api/sleeps/sleep-1/wake", {
    lost: 1,
    until: answer.opened,
    answer: (body) => ({ sleep: { ...sleep, endedAt: body.occurredAt ?? NOW, version: 2 }, changed: [["today"]] }),
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Sleep")
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect(sheet).toBeHidden()
  await page.clock.setFixedTime(OPENED_AGAIN)
  await openSheet(page, "Sleep")
  answer.open()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]?.actionId).toBe(bodies[0]?.actionId)
  expect(bodies[1]?.occurredAt).toBe(FIRST_TAP)
})

test("a wake that failed offline asks before its sheet lets it go, and Keep leaves it to save at the first tap's time", async ({
  page,
  context,
}) => {
  const { andrew } = await caregiversOf(page)
  const sleep = runningSleep(andrew.id, STARTED)
  await playHousehold(page, sleepingToday(sleep))
  const bodies = await loseSaves(page, "**/api/sleeps/sleep-1/wake", {
    lost: 1,
    until: Promise.resolve(),
    answer: (body) => ({ sleep: { ...sleep, endedAt: body.occurredAt ?? NOW, version: 2 }, changed: [["today"]] }),
  })
  await openToday(page)
  await context.setOffline(true)
  await expect(page.getByRole("alert").filter({ hasText: "No connection" }).first()).toBeVisible()
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Sleep")
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText(
    "No connection. Keep the app open, and try again once you're back online.",
  )
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the wake-up at 9:30\sAM\?DiscardKeep$/u)
  await sheet.getByRole("button", { name: "Keep" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await page.clock.setFixedTime(FIRST_TAP + 15 * MINUTE)
  await context.setOffline(false)
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]?.actionId).toBe(bodies[0]?.actionId)
  expect(bodies[1]?.occurredAt).toBe(FIRST_TAP)
})

test("a pause that failed asks before its sheet lets it go, and Discard lets it go unsent", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  await playHousehold(page, todayWith(feed))
  const bodies = await loseSaves(page, "**/api/feeds/feed-1/pause", {
    lost: 1,
    until: Promise.resolve(),
    answer: () => ({ feed: { ...feed, version: 2 }, changed: [["today"]] }),
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect(sheet).toBeHidden()
  await openSheet(page, "Nursing")
  await expect(sheet.getByRole("button", { name: "Pause", exact: true })).toBeVisible()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  expect(bodies).toHaveLength(1)
})

test("a diaper changed after its first send landed unanswered keeps that send's actionId, so the household says it was already saved", async ({
  page,
}) => {
  await playHousehold(page, todayWith())
  const sent: Array<{ readonly actionId?: string; readonly dirty?: boolean }> = []
  const answered: number[] = []
  await page.route("**/api/diapers", async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    sent.push(route.request().postDataJSON())
    const response = await route.fetch()
    answered.push(response.status())
    if (sent.length === 1) return route.abort("internetdisconnected")
    return route.fulfill({ response })
  })
  await openToday(page)
  const sheet = await openSheet(page, "Diaper")
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Poo" }).click()
  await expect(sheet.getByRole("alert")).toContainText("This was already saved as you first entered it.")
  expect(sent.map(({ actionId }) => actionId)).toEqual([sent[0]?.actionId, sent[0]?.actionId])
  expect(sent[1]?.dirty).toBe(true)
  expect(answered).toEqual([201, 409])
})

const failPauseThenChangeStart = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  const { played, answer } = await playHousehold(page, todayWith(feed))
  await answer("**/api/segments/segment-1", () => ({
    status: 200,
    json: { feed: { ...feed, version: 2 }, changed: [["today"]] },
  }))
  const paused = await loseSaves(page, "**/api/feeds/feed-1/pause", {
    lost: 1,
    until: Promise.resolve(),
    answer: () => ({ feed: { ...feed, version: 2 }, changed: [["today"]] }),
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Started").fill("2026-10-09T08:45")
  await sheet.getByRole("button", { name: "Save start" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
  return { sheet, played, paused }
}

test("a failed pause asks before its feed's start is changed, and Keep sends nothing, so Try again saves the first tap's time", async ({
  page,
}) => {
  const { sheet, played, paused } = await failPauseThenChangeStart(page)
  await sheet.getByRole("button", { name: "Keep" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  expect(played.sent).toEqual([])
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect.poll(() => paused.length).toBe(2)
  expect(paused[1]?.actionId).toBe(paused[0]?.actionId)
  expect(paused[1]?.occurredAt).toBe(FIRST_TAP)
})

test("a failed pause's Discard lets it go and sends the start change", async ({ page }) => {
  const { sheet, played, paused } = await failPauseThenChangeStart(page)
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect.poll(() => played.sent.length).toBe(1)
  expect(played.sent[0]?.path).toBe("/api/segments/segment-1")
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  expect(paused).toHaveLength(1)
})

const failWakeThenPickNight = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const sleep = runningSleep(andrew.id, STARTED)
  const night = runningSleep(andrew.id, STARTED, "night", 2)
  const { played, answer } = await playHousehold(page, sleepingToday(sleep))
  await answer("**/api/sleeps/sleep-1", () => {
    played.today = sleepingToday(night)
    return { status: 200, json: { sleep: night, changed: [["today"]] } }
  })
  const woke = await loseSaves(page, "**/api/sleeps/sleep-1/wake", {
    lost: 1,
    until: Promise.resolve(),
    answer: (body) => ({ sleep: { ...night, endedAt: body.occurredAt ?? NOW, version: 3 }, changed: [["today"]] }),
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Sleep")
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await expect(sheet.getByLabel("Woke", { exact: true })).toHaveValue("2026-10-09T09:30")
  await sheet.getByRole("button", { name: "Night", exact: true }).click()
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the wake-up at 9:30\sAM\?DiscardKeep$/u)
  return { sheet, played, woke }
}

test("a failed wake asks before Nap or night is changed, and Keep sends nothing", async ({ page }) => {
  const { sheet, played } = await failWakeThenPickNight(page)
  await sheet.getByRole("button", { name: "Keep" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  expect(played.sent).toEqual([])
})

test("a failed wake's Discard sends Nap or night, and Wake up then sends a new wake at its own tap's time", async ({
  page,
}) => {
  const { sheet, played, woke } = await failWakeThenPickNight(page)
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect.poll(() => played.sent.length).toBe(1)
  expect(played.sent[0]?.path).toBe("/api/sleeps/sleep-1")
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await expect(sheet.getByLabel("Woke", { exact: true })).toHaveCount(0)
  await page.clock.setFixedTime(FIRST_TAP + 30 * MINUTE)
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect.poll(() => woke.length).toBe(2)
  expect(woke[1]?.actionId).not.toBe(woke[0]?.actionId)
  expect(woke[1]?.occurredAt).toBe(FIRST_TAP + 30 * MINUTE)
})

test("a finish that met the other phone's change and was let go with OK leaves Finish feed to send a new finish at its own tap's time", async ({
  page,
}) => {
  const { andrew, emily } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  const { played } = await playHousehold(page, todayWith(feed))
  const theirs = { ...feed, version: 2, updatedBy: emily.id }
  const finished: Array<{ readonly actionId?: string; readonly version?: number; readonly occurredAt?: number }> = []
  await page.route("**/api/feeds/feed-1/finish", async (route) => {
    finished.push(route.request().postDataJSON())
    if (finished.length === 1) {
      played.today = todayWith(theirs)
      return route.fulfill({ status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } })
    }
    return route.fulfill({ status: 200, json: { feed: { ...theirs, status: "completed", version: 3 }, changed: [] } })
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Finish", exact: true }).click()
  await sheet.getByRole("button", { name: "Finish feed" }).click()
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this feed a moment ago.`)
  await expect(sheet.getByLabel("Stopped", { exact: true })).toHaveValue("2026-10-09T09:30")
  await sheet.getByRole("alert").getByRole("button", { name: "OK" }).click()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await expect(sheet.getByLabel("Stopped", { exact: true })).toHaveCount(0)
  await page.clock.setFixedTime(FIRST_TAP + 3 * MINUTE)
  await sheet.getByRole("button", { name: "Finish feed" }).click()
  await expect.poll(() => finished.length).toBe(2)
  expect(finished[1]).toMatchObject({ version: 2, occurredAt: FIRST_TAP + 3 * MINUTE })
  expect(finished[1]?.actionId).not.toBe(finished[0]?.actionId)
})

test("a pause whose resend meets a change Pause anyway would still save asks before closing drops it", async ({
  page,
}) => {
  const { andrew, emily } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  await playHousehold(page, todayWith(feed))
  const theirs = { ...feed, version: 2, updatedBy: emily.id }
  const sent: Array<{ readonly actionId?: string; readonly version?: number; readonly occurredAt?: number }> = []
  await page.route("**/api/feeds/feed-1/pause", async (route) => {
    sent.push(route.request().postDataJSON())
    if (sent.length === 1) return route.abort("internetdisconnected")
    if (sent.length === 2) {
      return route.fulfill({ status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } })
    }
    return route.fulfill({ status: 200, json: { feed: { ...theirs, version: 3 }, changed: [["today"]] } })
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this feed a moment ago.`)
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
  await sheet.getByRole("button", { name: "Keep" }).click()
  await sheet.getByRole("button", { name: "Pause anyway" }).click()
  await expect.poll(() => sent.length).toBe(3)
  expect(sent[2]).toMatchObject({ actionId: sent[0]?.actionId, version: 2, occurredAt: FIRST_TAP })
})

test("a pause that fails beside a start this phone kept shows first, and Pause tapped again saves the first tap's time", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  await playHousehold(page, todayWith(feed))
  const kept = [
    {
      sending: {
        sheet: "nursing",
        action: {
          kind: "startFeed",
          payload: { actionId: "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a", side: "left", startedAt: STARTED },
        },
      },
      keptAt: STARTED,
      idSince: STARTED,
      failed: false,
    },
  ]
  await page.addInitScript((stored) => localStorage.setItem("bt.kept", stored), JSON.stringify(kept))
  const paused = await loseSaves(page, "**/api/feeds/feed-1/pause", {
    lost: 1,
    until: Promise.resolve(),
    answer: () => ({ feed: { ...feed, version: 2 }, changed: [["today"]] }),
  })
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await expect(sheet.getByRole("alert")).toContainText("might not have been saved")
  await expect(sheet.getByRole("button", { name: "Pause", exact: true })).toBeEnabled()
  await page.clock.setFixedTime(FIRST_TAP)
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await page.clock.setFixedTime(FIRST_TAP + 3 * MINUTE)
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect.poll(() => paused.length).toBe(2)
  expect(paused[1]?.actionId).toBe(paused[0]?.actionId)
  expect(paused[1]?.occurredAt).toBe(FIRST_TAP)
})

test("a pause that met the other phone's change, tapped again, saves the first tap's time as Pause anyway would", async ({
  page,
}) => {
  const { andrew, emily } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  await playHousehold(page, todayWith(feed))
  const theirs = { ...feed, version: 2, updatedBy: emily.id }
  const sent: Array<{ readonly actionId?: string; readonly version?: number; readonly occurredAt?: number }> = []
  await page.route("**/api/feeds/feed-1/pause", async (route) => {
    sent.push(route.request().postDataJSON())
    if (sent.length === 1) {
      return route.fulfill({ status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } })
    }
    return route.fulfill({ status: 200, json: { feed: { ...theirs, version: 3 }, changed: [["today"]] } })
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this feed a moment ago.`)
  await page.clock.setFixedTime(FIRST_TAP + 3 * MINUTE)
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1]).toMatchObject({ actionId: sent[0]?.actionId, version: 2, occurredAt: FIRST_TAP })
})

test("a pause after a failed start change goes out at once, and the change stays with its note", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  const { played, answer } = await playHousehold(page, todayWith(feed))
  await page.route("**/api/segments/segment-1", (route) => route.abort("internetdisconnected"))
  await answer("**/api/feeds/feed-1/pause", () => ({
    status: 200,
    json: { feed: { ...feed, version: 2 }, changed: [["today"]] },
  }))
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Started").fill("2026-10-09T08:45")
  await sheet.getByRole("button", { name: "Save start" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect.poll(() => played.sent.length).toBe(1)
  expect(played.sent[0]?.body).toMatchObject({ occurredAt: FIRST_TAP })
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard your changes\?DiscardKeep$/u)
})

const pauseAndFinishLost = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  const { played, answer } = await playHousehold(page, todayWith(feed))
  await answer("**/api/diapers", ({ body }) => ({ status: 201, json: savedDiaper(andrew.id)(body) }))
  await answer("**/api/segments/segment-1", () => ({
    status: 200,
    json: { feed: { ...feed, version: 2 }, changed: [["today"]] },
  }))
  const pauseLost = gate()
  const finishLost = gate()
  const paused: unknown[] = []
  await page.route("**/api/feeds/feed-1/pause", async (route) => {
    paused.push(route.request().postDataJSON())
    if (paused.length > 1) {
      return route.fulfill({ status: 200, json: { feed: { ...feed, version: 2 }, changed: [["today"]] } })
    }
    await pauseLost.opened
    return route.abort("internetdisconnected")
  })
  await page.route("**/api/feeds/feed-1/finish", async (route) => {
    await finishLost.opened
    return route.abort("internetdisconnected")
  })
  await openToday(page)
  await page.clock.setFixedTime(FIRST_TAP)
  const sheet = await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect.poll(() => paused.length).toBe(1)
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  const diaper = await openSheet(page, "Diaper")
  await diaper.getByRole("button", { name: "Pee" }).click()
  await expect(diaper).toBeHidden()
  await expect.poll(() => played.sent.length).toBe(1)
  await page.clock.setFixedTime(FIRST_TAP + MINUTE)
  await openSheet(page, "Nursing")
  await sheet.getByRole("button", { name: "Finish", exact: true }).click()
  await sheet.getByRole("button", { name: "Finish feed" }).click()
  await expect(sheet).toBeHidden()
  pauseLost.open()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  finishLost.open()
  await expect(sheet.getByRole("button", { name: "Pause", exact: true })).toBeEnabled()
  return { sheet, played, paused }
}

test("a pause and a finish that both failed on their way: Try again on the pause keeps the finish, which closing then asks about", async ({
  page,
}) => {
  const { sheet, paused } = await pauseAndFinishLost(page)
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect.poll(() => paused.length).toBe(2)
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the finish at 9:31\sAM\?DiscardKeep$/u)
})

test("discarding a failed pause before a start change asks about the finish held behind it before the change goes out", async ({
  page,
}) => {
  const { sheet, played } = await pauseAndFinishLost(page)
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Started").fill("2026-10-09T08:45")
  await sheet.getByRole("button", { name: "Save start" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the pause at 9:30\sAM\?DiscardKeep$/u)
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the finish at 9:31\sAM\?DiscardKeep$/u)
  expect(played.sent.filter(({ path }) => path === "/api/segments/segment-1")).toHaveLength(0)
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect.poll(() => played.sent.filter(({ path }) => path === "/api/segments/segment-1").length).toBe(1)
})

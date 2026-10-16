import type { Locator, Page } from "@playwright/test"
import { busyDay, DAY, emptyDay, measurement, openHistory, playHistory } from "./played-day.ts"
import {
  caregiversOf,
  type FeedAnswer,
  gate,
  holdRequests,
  loseSaves,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  savedBy,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const recent = (page: Page) => page.getByRole("list", { name: "Last 24 hours" })

const playDiapers = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const diaperAt = (id: string, minutesAgo: number) => ({
    id,
    occurredAt: NOW - minutesAgo * MINUTE,
    wet: true,
    dirty: false,
    ...savedBy(andrew.id),
  })
  const diapers = [diaperAt("newer", 20), diaperAt("older", 50)]
  return playHousehold(page, { ...todayWith(), recent: diapers.map((diaper) => ({ kind: "diaper", diaper })) })
}

const dialogsInThePage = (page: Page) => page.getByRole("dialog", { includeHidden: true })

const afterFrames = (page: Page) =>
  page.evaluate("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))")

const whereFocusIs = (sheet: Locator) =>
  sheet.evaluate((element) => {
    const focused = element.ownerDocument.activeElement
    return element.contains(focused) ? "inside the sheet" : `${focused?.tagName} ${focused?.textContent?.slice(0, 30)}`
  })

const waitUntilAloneIn = async (page: Page, sheet: Locator) => {
  await expect(sheet).toBeVisible()
  await expect(dialogsInThePage(page)).toHaveCount(1)
}

const expectFocusStaysIn = async (page: Page, sheet: Locator) => {
  await waitUntilAloneIn(page, sheet)
  await afterFrames(page)
  expect(await whereFocusIs(sheet)).toBe("inside the sheet")
}

const editFromDetails = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  await openHistory(page)
  const entry = page.getByRole("button", { name: /^Diaper at 5:30\sAM/u })
  await entry.click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Edit" }).click()
  return { entry, sheet: page.getByRole("dialog", { name: "Edit diaper" }) }
}

test("a sheet opened by a tap gives focus back to the button that opened it", async ({ page }) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await quickAction(page, "Diaper").click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(quickAction(page, "Diaper")).toBeFocused()
})

test("an edit that's still saving keeps focus on its row", async ({ page }) => {
  const { answer } = await playDiapers(page)
  await answer("**/api/diapers/newer", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  const answered = gate()
  await holdRequests(page, "**/api/diapers/newer", () => answered.opened)
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /Diaper/u })
    .first()
    .click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Both" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page).getByRole("listitem").filter({ hasText: "Saving" })).toBeFocused()
  answered.open()
})

test("deleting an entry moves focus to the row after it", async ({ page }) => {
  const { answer } = await playDiapers(page)
  await answer("**/api/diapers/newer", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  const answered = gate()
  await holdRequests(page, "**/api/diapers/newer", () => answered.opened)
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /Diaper/u })
    .first()
    .click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Delete diaper" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page).getByRole("button", { name: /Diaper/u })).toHaveCount(1)
  await expect(recent(page).getByRole("button", { name: /Diaper/u })).toBeFocused()
  answered.open()
})

test("a measurement that's still saving keeps focus on its card", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const weighed = measurement("m3", NOW - 3 * 24 * 60 * MINUTE, 4300, 54.5, 36.8, andrew.id)
  await page.route("**/api/growth", (route) => route.fulfill({ json: { measurements: [weighed] } }))
  const answered = gate()
  await page.route("**/api/growth/m3", async (route) => {
    await answered.opened
    await route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } })
  })
  await page.clock.setFixedTime(NOW)
  await page.goto("/growth")
  await page.getByRole("button", { name: /^Edit the measurement from/u }).click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4.4")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  const card = page.getByRole("region", { name: "Measurements" }).getByRole("listitem").filter({ hasText: "Saving" })
  await expect(card).toBeFocused()
  answered.open()
})

test("a failure that comes back to an open sheet takes focus, with its buttons next", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { answer } = await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
  await answer("**/api/feeds/feed-1/pause", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  await openToday(page)
  await quickAction(page, "Nursing").click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await sheet.getByRole("button", { name: "Pause" }).click()
  await expect(sheet.getByRole("alert")).toBeFocused()
})

test("picking a date in Go to gives focus back to Change", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-05")])
  await openHistory(page)
  const days = page.getByRole("navigation", { name: "Days" })
  await days.getByRole("button", { name: "Change" }).click()
  await page.getByLabel("Go to").fill("2026-10-05")
  await expect(days.getByRole("heading")).toHaveText("Mon, Oct 5")
  await expect(days.getByRole("button", { name: "Change" })).toBeFocused()
})

test.describe("on an iPhone's browser tab", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Not now on the install card moves focus to the page's heading", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "standalone", { configurable: true, get: () => false })
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { configurable: true, get: () => 5 })
    })
    await page.goto("/")
    await page.getByRole("region", { name: "Install Baby tracker" }).getByRole("button", { name: "Not now" }).click()
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeFocused()
  })
})

test("deleting an entry from History's details moves focus to the page's heading", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  const answered = gate()
  await page.route("**/api/diapers/both", async (route) => {
    await answered.opened
    await route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } })
  })
  await openHistory(page)
  await page.getByRole("button", { name: /^Diaper at 5:30\sAM/u }).click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Edit" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await expectFocusStaysIn(page, sheet)
  await sheet.getByRole("button", { name: "Delete diaper" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeFocused()
  answered.open()
})

test("a sheet opened from History's details keeps focus once the details have gone", async ({ page }) => {
  const { sheet } = await editFromDetails(page)
  await expectFocusStaysIn(page, sheet)
})

test("a sheet opened from the Sleep sheet keeps focus once the Sleep sheet has gone", async ({ page }) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await quickAction(page, "Sleep").click()
  await page.getByRole("dialog", { name: "Sleep" }).getByRole("button", { name: "Log a past sleep" }).click()
  await expectFocusStaysIn(page, page.getByRole("dialog", { name: "Past sleep" }))
})

test("closing an edit opened from History's details gives focus back to the entry that opened the details", async ({
  page,
}) => {
  const { entry, sheet } = await editFromDetails(page)
  await waitUntilAloneIn(page, sheet)
  await page.keyboard.press("Escape")
  await expect(dialogsInThePage(page)).toHaveCount(0)
  await expect(entry).toBeFocused()
})

test("saving an edit opened from History's details gives focus back to the entry that opened the details", async ({
  page,
}) => {
  const answered = gate()
  await page.route("**/api/diapers/both", async (route) => {
    await answered.opened
    await route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } })
  })
  const { entry, sheet } = await editFromDetails(page)
  await waitUntilAloneIn(page, sheet)
  await sheet.getByRole("button", { name: "Pee", exact: true }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(dialogsInThePage(page)).toHaveCount(0)
  await expect(entry).toBeFocused()
  answered.open()
})

test("a held failure handed on to the next sheet keeps its note focused", async ({ page }) => {
  await playHousehold(page, todayWith())
  const diaperLost = gate()
  const sleepLost = gate()
  await loseSaves(page, "**/api/diapers", { lost: 1, until: diaperLost.opened, answer: () => ({}) })
  await loseSaves(page, "**/api/sleeps/start", { lost: 1, until: sleepLost.opened, answer: () => ({}) })
  await openToday(page)
  const reload = gate()
  const reloads = await holdRequests(page, "**/api/today", () => reload.opened)
  const diaper = page.getByRole("dialog", { name: "Diaper" })
  const sleep = page.getByRole("dialog", { name: "Sleep" })
  await quickAction(page, "Diaper").click()
  await diaper.getByRole("button", { name: "Pee" }).click()
  await expect(diaper).toBeHidden()
  await quickAction(page, "Sleep").click()
  await sleep.getByRole("button", { name: "Start sleep" }).click()
  await expect(sleep).toBeHidden()
  diaperLost.open()
  await expect(diaper.getByRole("alert")).toContainText("No connection")
  sleepLost.open()
  await expect.poll(() => reloads.length).toBe(2)
  await page.keyboard.press("Escape")
  await diaper.getByRole("button", { name: "Discard" }).click()
  await waitUntilAloneIn(page, sleep)
  await afterFrames(page)
  await expect(sleep.getByRole("alert")).toBeFocused()
  reload.open()
})

const nursing = (page: Page) => page.getByRole("dialog", { name: "Nursing" })

const heldUntilOpened = async (page: Page, pattern: string) => {
  const answered = gate()
  await holdRequests(page, pattern, () => answered.opened)
  return answered
}

const pausedAt = (feed: FeedAnswer, at: number): FeedAnswer => ({
  ...feed,
  version: feed.version + 1,
  segments: feed.segments.map((segment) => ({ ...segment, endedAt: segment.endedAt ?? at })),
})

const resumedOn = (feed: FeedAnswer, side: "left" | "right", at: number): FeedAnswer => ({
  ...pausedAt(feed, at),
  segments: [...pausedAt(feed, at).segments, { id: "segment-2", side, startedAt: at, endedAt: null }],
})

const playFeed = async (page: Page, feed: FeedAnswer, step: string, after: FeedAnswer) => {
  const household = await playHousehold(page, todayWith(feed))
  await household.answer(`**/api/feeds/feed-1/${step}`, () => {
    household.played.today = todayWith(after)
    return { status: 200, json: { feed: after, changed: [["today"]] } }
  })
}

const runningFor = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  return runningFeed(andrew.id, NOW - 10 * MINUTE, "left")
}

const openNursing = async (page: Page) => {
  await openToday(page)
  await quickAction(page, "Nursing").click()
  return nursing(page)
}

const sharesFiles = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: () => true })
    Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: () => Promise.resolve() })
  })

const openExport = async (page: Page) => {
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings")
  await page.getByRole("heading", { name: "Export" }).waitFor()
  return page.locator("section", { has: page.getByRole("heading", { name: "Export" }) })
}

const deletedDiaper = (id: string, minutesAgo: number, by: string) => ({
  id,
  occurredAt: NOW - (minutesAgo + 30) * MINUTE,
  wet: true,
  dirty: false,
  version: 2,
  createdBy: by,
  createdAt: NOW - (minutesAgo + 30) * MINUTE,
  updatedBy: by,
  updatedAt: NOW - minutesAgo * MINUTE,
  deletedAt: NOW - minutesAgo * MINUTE,
})

const playDeleted = async (page: Page, ids: ReadonlyArray<string>) => {
  const { andrew } = await caregiversOf(page)
  const played = { diapers: ids.map((id, index) => deletedDiaper(id, (index + 1) * 10, andrew.id)) }
  await page.route("**/api/deleted", (route) =>
    route.fulfill({ json: { feeds: [], diapers: played.diapers, sleeps: [], measurements: [], doses: [] } }),
  )
  await page.route("**/api/diapers/*/restore", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)
    const restored = played.diapers.find((one) => one.id === id)
    played.diapers = played.diapers.filter((one) => one.id !== id)
    return route.fulfill({ json: { diaper: { ...restored, version: 3, deletedAt: null }, changed: [["deleted"]] } })
  })
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings/deleted")
  return page.getByRole("list", { name: "Deleted entries" }).getByRole("listitem")
}

const restoreIn = (row: Locator) => row.getByRole("button")

const expectWaitingWithFocus = async (page: Page, control: Locator) => {
  await expect(control).toBeDisabled()
  await afterFrames(page)
  await expect(control).toBeFocused()
}

test.describe("a control that waits on what it asked for keeps focus", () => {
  test("Pause, while the feed pauses", async ({ page }) => {
    const running = await runningFor(page)
    await playFeed(page, running, "pause", pausedAt(running, NOW))
    const answered = await heldUntilOpened(page, "**/api/feeds/feed-1/pause")
    const pause = (await openNursing(page)).getByRole("button", { name: "Pause" })
    await pause.press("Enter")
    await expectWaitingWithFocus(page, pause)
    answered.open()
  })

  test("a side to resume on, while the feed resumes", async ({ page }) => {
    const resting = pausedAt(await runningFor(page), NOW - 5 * MINUTE)
    await playFeed(page, resting, "resume", resumedOn(resting, "right", NOW))
    const answered = await heldUntilOpened(page, "**/api/feeds/feed-1/resume")
    const right = (await openNursing(page)).getByRole("button", { name: "Right", exact: true })
    await right.press("Enter")
    await expectWaitingWithFocus(page, right)
    answered.open()
  })

  test("Switch, while the feed switches sides and after", async ({ page }) => {
    const running = await runningFor(page)
    await playFeed(page, running, "switch", resumedOn(running, "right", NOW))
    const answered = await heldUntilOpened(page, "**/api/feeds/feed-1/switch")
    const sheet = await openNursing(page)
    const toRight = sheet.getByRole("button", { name: "Switch to Right" })
    await toRight.press("Enter")
    await expectWaitingWithFocus(page, toRight)
    answered.open()
    await expect(sheet.getByRole("button", { name: "Switch to Left" })).toBeFocused()
  })

  test("an export button, while its file is made and after", async ({ page }) => {
    await sharesFiles(page)
    const answered = await heldUntilOpened(page, "**/api/export.csv")
    const section = await openExport(page)
    await section.getByRole("button", { name: "Share CSV" }).press("Enter")
    await expectWaitingWithFocus(page, section.getByRole("button", { name: "Preparing…" }))
    answered.open()
    await expect(section.getByRole("button", { name: "Share CSV" })).toBeFocused()
  })

  test("Try again, while the day loads", async ({ page }) => {
    const { played } = await playHistory(page, [])
    await openHistory(page)
    const tryAgain = page.getByRole("button", { name: "Try again" })
    await expect(tryAgain).toBeVisible()
    played.days.push(emptyDay(DAY))
    const answered = await heldUntilOpened(page, `**/api/days/${DAY}`)
    await tryAgain.press("Enter")
    await expectWaitingWithFocus(page, page.getByRole("button", { name: "Trying again…" }))
    answered.open()
  })

  test("Restore, while the entry is restored", async ({ page }) => {
    const rows = await playDeleted(page, ["first", "second"])
    const answered = await heldUntilOpened(page, "**/api/diapers/first/restore")
    await restoreIn(rows.first()).press("Enter")
    await expect(restoreIn(rows.first())).toHaveAccessibleName(/^Restoring…/u)
    await expectWaitingWithFocus(page, restoreIn(rows.first()))
    answered.open()
  })
})

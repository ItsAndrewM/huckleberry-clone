import type { Locator, Page } from "@playwright/test"
import {
  busyDay,
  DAY,
  dayHeading,
  diaper as diaperOn,
  emptyDay,
  local,
  measurement,
  openHistory,
  playHistory,
} from "./played-day.ts"
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
  runningSleep,
  savedBy,
  savedDiaper,
  sleepingToday,
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

const expectStartHandsFocusOn = async (sheet: Locator, label: string, earlier: string) => {
  const change = sheet.getByRole("button", { name: `Change, ${label}` })
  const time = sheet.getByLabel(label, { exact: true })
  await change.press("Enter")
  await expect(time).toBeFocused()
  await sheet.getByRole("button", { name: "Cancel" }).press("Enter")
  await expect(change).toBeFocused()
  await change.press("Enter")
  await time.fill(earlier)
  await sheet.getByRole("button", { name: "Save start" }).press("Enter")
  await expect(change).toBeFocused()
}

const inVancouver = async (page: Page) => {
  const { andrew, me } = await caregiversOf(page)
  const household = { ...me.household, timeZone: "America/Vancouver" }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household } }))
  return andrew.id
}

const playDiaperSaves = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const { answer } = await playHousehold(page, todayWith())
  await answer("**/api/diapers", ({ body }) => ({ status: 201, json: savedDiaper(andrew.id)(body) }))
  await answer("**/api/diapers/*", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  await openToday(page)
  await quickAction(page, "Diaper").click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Pee" }).click()
  await expect(dialogsInThePage(page)).toHaveCount(0)
  return page.getByRole("button", { name: "Undo" })
}

const todayHeading = (page: Page) => page.getByRole("heading", { name: "Today", level: 1 })

interface PlayedSupplement {
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

const VITAMIN_D: PlayedSupplement = {
  id: "supplement-vitamin-d",
  name: "Vitamin D",
  dose: "400 IU",
  stoppedAt: null,
  version: 1,
  createdBy: null,
  createdAt: NOW,
  updatedBy: null,
  updatedAt: NOW,
}

const openVitaminD = async (page: Page, saved: Promise<void> = Promise.resolve()) => {
  const { me } = await caregiversOf(page)
  const played = { supplements: [VITAMIN_D] }
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { ...me, household: { ...me.household, supplements: played.supplements } } }),
  )
  await page.route("**/api/supplements/*", async (route) => {
    const { name, dose, stopped } = route.request().postDataJSON()
    await saved
    const supplement = { ...VITAMIN_D, name, dose, stoppedAt: stopped === true ? NOW : null, version: 2 }
    played.supplements = [supplement]
    return route.fulfill({ json: { supplement, changed: [["me"]] } })
  })
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings")
  const row = page.getByRole("list", { name: "Supplements" }).getByRole("button", { name: /^Vitamin D/u })
  await row.click()
  return { row, sheet: page.getByRole("dialog", { name: "Vitamin D" }) }
}

test.describe("a control that gives way hands focus on", () => {
  test("Change on a When field to its time, and Now back to Change", async ({ page }) => {
    await playHousehold(page, todayWith())
    await openToday(page)
    await quickAction(page, "Diaper").click()
    const sheet = page.getByRole("dialog", { name: "Diaper" })
    const change = sheet.getByRole("button", { name: "Change, When" })
    await change.press("Enter")
    await expect(sheet.getByLabel("When", { exact: true })).toBeFocused()
    await sheet.getByRole("button", { name: "Now", exact: true }).press("Enter")
    await expect(change).toBeFocused()
  })

  test("a running feed's Change to its start, and Cancel and Save start back to Change", async ({ page }) => {
    const andrew = await inVancouver(page)
    const { answer } = await playHousehold(page, todayWith(runningFeed(andrew, NOW - 10 * MINUTE, "left")))
    await answer("**/api/segments/segment-1", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
    const answered = await heldUntilOpened(page, "**/api/segments/segment-1")
    await expectStartHandsFocusOn(await openNursing(page), "Started", "2026-10-09T09:10")
    answered.open()
  })

  test("a running sleep's Change to its start, and Cancel and Save start back to Change", async ({ page }) => {
    const andrew = await inVancouver(page)
    const { answer } = await playHousehold(page, sleepingToday(runningSleep(andrew, NOW - 30 * MINUTE)))
    await answer("**/api/sleeps/sleep-1", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
    const answered = await heldUntilOpened(page, "**/api/sleeps/sleep-1")
    await openToday(page)
    await quickAction(page, "Sleep").click()
    await expectStartHandsFocusOn(page.getByRole("dialog", { name: "Sleep" }), "Fell asleep", "2026-10-09T08:50")
    answered.open()
  })

  test("Pause to the paused view's first control, once the feed has paused", async ({ page }) => {
    const running = await runningFor(page)
    await playFeed(page, running, "pause", pausedAt(running, NOW))
    const sheet = await openNursing(page)
    await sheet.getByRole("button", { name: "Pause" }).press("Enter")
    await expect(sheet.getByText("Paused")).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Change, Started" })).toBeFocused()
  })

  test("a side to resume on to the running view's first control, once the feed has resumed", async ({ page }) => {
    const resting = pausedAt(await runningFor(page), NOW - 5 * MINUTE)
    await playFeed(page, resting, "resume", resumedOn(resting, "right", NOW))
    const sheet = await openNursing(page)
    await sheet.getByRole("button", { name: "Right", exact: true }).press("Enter")
    await expect(sheet.getByText("Right side")).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Change, Started" })).toBeFocused()
  })

  test("Finish to the stop time's Change, and Back to the running view's first control", async ({ page }) => {
    await playHousehold(page, todayWith(await runningFor(page)))
    const sheet = await openNursing(page)
    await sheet.getByRole("button", { name: "Finish", exact: true }).press("Enter")
    await expect(sheet.getByRole("button", { name: "Change, Stopped" })).toBeFocused()
    await sheet.getByRole("button", { name: "Back", exact: true }).press("Enter")
    await expect(sheet.getByRole("button", { name: "Change, Started" })).toBeFocused()
  })

  test("Keep it back to Delete", async ({ page }) => {
    await playDiapers(page)
    await openToday(page)
    await recent(page)
      .getByRole("button", { name: /Diaper/u })
      .first()
      .click()
    const sheet = page.getByRole("dialog", { name: "Edit diaper" })
    const remove = sheet.getByRole("button", { name: "Delete diaper" })
    await remove.press("Enter")
    await sheet.getByRole("button", { name: "Keep it" }).press("Enter")
    await expect(remove).toBeFocused()
  })

  test("Keep giving it back to Stop giving it", async ({ page }) => {
    const { sheet } = await openVitaminD(page)
    const stop = sheet.getByRole("button", { name: "Stop giving it" })
    await stop.press("Enter")
    await sheet.getByRole("button", { name: "Keep giving it" }).press("Enter")
    await expect(stop).toBeFocused()
  })

  test("Restore to the next row's Restore, else the previous row's, else the page's heading", async ({ page }) => {
    const rows = await playDeleted(page, ["first", "second", "third"])
    await expect(rows).toHaveCount(3)
    const [first, second, third] = await Promise.all(
      [0, 1, 2].map(async (index) => (await restoreIn(rows.nth(index)).getAttribute("aria-label")) ?? ""),
    )
    const restore = (name: string) => page.getByRole("button", { name, exact: true })
    await restore(second ?? "").press("Enter")
    await expect(restore(third ?? "")).toBeFocused()
    await restore(third ?? "").press("Enter")
    await expect(restore(first ?? "")).toBeFocused()
    await restore(first ?? "").press("Enter")
    await expect(page.getByRole("heading", { name: "Recently deleted", level: 1 })).toBeFocused()
  })

  test("Undo to the page's heading", async ({ page }) => {
    const undo = await playDiaperSaves(page)
    await undo.press("Enter")
    await expect(undo).toHaveCount(0)
    await expect(todayHeading(page)).toBeFocused()
  })

  test("a toast that goes while Undo has focus to the page's heading", async ({ page }) => {
    const undo = await playDiaperSaves(page)
    await undo.focus()
    await expect(undo).toHaveCount(0, { timeout: 10_000 })
    await expect(todayHeading(page)).toBeFocused()
  })

  test("Try again to the page's heading, once the day loads", async ({ page }) => {
    const { played } = await playHistory(page, [])
    await openHistory(page)
    const tryAgain = page.getByRole("button", { name: "Try again" })
    await expect(tryAgain).toBeVisible()
    played.days.push(emptyDay(DAY))
    await tryAgain.press("Enter")
    await expect(page.getByRole("region", { name: "This day" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeFocused()
  })
})

test("a When field's message describes its time and is said politely, from a region that was there before it", async ({
  page,
}) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await quickAction(page, "Diaper").click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await sheet.getByRole("button", { name: "Change, When" }).click()
  const when = sheet.getByLabel("When", { exact: true })
  const messageId = await when.getAttribute("aria-describedby")
  expect(messageId).not.toBeNull()
  const message = sheet.locator(`[id="${messageId}"]`)
  await expect(message).toHaveAttribute("aria-live", "polite")
  await expect(message).toBeEmpty()
  await expect(when).not.toHaveAttribute("aria-invalid", "true")
  await message.evaluate((element) => element.setAttribute("data-probe", "1"))
  await when.fill("2027-01-01T10:00")
  await expect(when).toHaveAttribute("aria-invalid", "true")
  await expect(when).toHaveAccessibleDescription("That's in the future.")
  await expect(message).toHaveAttribute("data-probe", "1")
})

declare global {
  var closeShareSheet: (() => void) | undefined
}

const sharesOnTheSecondTap = (page: Page) =>
  page.addInitScript(() => {
    let shares = 0
    Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: () => true })
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: () => {
        shares += 1
        if (shares === 1) return Promise.reject(new DOMException("The share sheet refused", "NotAllowedError"))
        return new Promise<void>((close) => {
          globalThis.closeShareSheet = close
        })
      },
    })
  })

test("Share it keeps focus while the share sheet is open, says nothing new, then gives focus back to the button that made the file", async ({
  page,
}) => {
  await sharesOnTheSecondTap(page)
  const section = await openExport(page)
  await section.getByRole("button", { name: "Share CSV" }).press("Enter")
  const shareIt = section.getByRole("button", { name: "Share it" })
  await shareIt.press("Enter")
  await expect.poll(() => page.evaluate("typeof globalThis.closeShareSheet")).toBe("function")
  await expect(shareIt).toBeFocused()
  await expect(section.getByRole("status")).toHaveText("The CSV is ready.")
  await page.evaluate("globalThis.closeShareSheet()")
  await expect(shareIt).toHaveCount(0)
  await expect(section.getByRole("button", { name: "Share CSV" })).toBeFocused()
})

test("going back with an entry's details open hands focus to the page's heading", async ({ page }) => {
  const { played, emily } = await playHistory(page, [emptyDay("2026-10-08")])
  played.days.push({
    ...emptyDay("2026-10-07"),
    diapers: [diaperOn("early", local("08:00", "2026-10-07"), true, false, emily)],
  })
  await openHistory(page, "?date=2026-10-08")
  await page.getByRole("link", { name: "Previous day" }).click()
  await expect(dayHeading(page)).toHaveText("Wed, Oct 7")
  await page.getByRole("button", { name: "Diaper at 8:00 AM: Pee" }).press("Enter")
  await expect(page.getByRole("dialog", { name: "Diaper" })).toBeVisible()
  await page.goBack()
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeFocused()
})

test("Escape in Go to closes it and gives focus back to Change, after a typed digit too", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-05")])
  await openHistory(page)
  const change = page.getByRole("navigation", { name: "Days" }).getByRole("button", { name: "Change day" })
  const goTo = page.getByLabel("Go to")
  await change.press("Enter")
  await expect(goTo).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(goTo).toHaveCount(0)
  await expect(change).toBeFocused()
  await change.press("Enter")
  await expect(goTo).toBeFocused()
  await page.keyboard.press("5")
  await page.keyboard.press("Escape")
  await expect(goTo).toHaveCount(0)
  await expect(change).toBeFocused()
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

const NOT_SAVED = { status: 503, json: { _tag: "ServiceUnavailable" } }

test.describe("a failure note's Try again hands focus to the control it retries", () => {
  test("Pause, which waits, then the paused view's first control", async ({ page }) => {
    const running = await runningFor(page)
    const household = await playHousehold(page, todayWith(running))
    const retried = gate()
    let pauses = 0
    await page.route("**/api/feeds/feed-1/pause", async (route) => {
      pauses += 1
      if (pauses === 1) return route.fulfill(NOT_SAVED)
      await retried.opened
      household.played.today = todayWith(pausedAt(running, NOW))
      return route.fulfill({ json: { feed: pausedAt(running, NOW), changed: [["today"]] } })
    })
    const sheet = await openNursing(page)
    const pause = sheet.getByRole("button", { name: "Pause" })
    await pause.press("Enter")
    await expect(sheet.getByRole("alert")).toBeFocused()
    await sheet.getByRole("alert").getByRole("button", { name: "Try again" }).press("Enter")
    await expectWaitingWithFocus(page, pause)
    retried.open()
    await expect(sheet.getByText("Paused")).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Change, Started" })).toBeFocused()
  })

  test("a sleep's Change, which waits, and a note that comes back takes focus again", async ({ page }) => {
    const andrew = await inVancouver(page)
    await playHousehold(page, sleepingToday(runningSleep(andrew, NOW - 30 * MINUTE)))
    const retried = gate()
    let edits = 0
    await page.route("**/api/sleeps/sleep-1", async (route) => {
      edits += 1
      if (edits === 2) await retried.opened
      return route.fulfill(NOT_SAVED)
    })
    await openToday(page)
    await quickAction(page, "Sleep").click()
    const sheet = page.getByRole("dialog", { name: "Sleep" })
    const change = sheet.getByRole("button", { name: "Change, Fell asleep" })
    await change.press("Enter")
    await sheet.getByLabel("Fell asleep", { exact: true }).fill("2026-10-09T08:50")
    await sheet.getByRole("button", { name: "Save start" }).press("Enter")
    const note = sheet.getByRole("alert")
    await expect(note).toBeFocused()
    await note.getByRole("button", { name: "Try again" }).press("Enter")
    await expectWaitingWithFocus(page, change)
    retried.open()
    await expect(note).toBeFocused()
  })
})

const playChildSave = async (page: Page, saved: Promise<void>) => {
  const { me } = await caregiversOf(page)
  const played = { child: me.child }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, child: played.child } }))
  await page.route("**/api/child", async (route) => {
    const { version, name } = route.request().postDataJSON()
    await saved
    played.child = { ...played.child, name, version: version + 1 }
    return route.fulfill({ json: { child: played.child, changed: [["me"]] } })
  })
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings")
}

test.describe("a Settings save keeps focus while it saves", () => {
  test("the child's Save, which keeps it once the child has saved", async ({ page }) => {
    const saved = gate()
    await playChildSave(page, saved.opened)
    await page.getByLabel("Name").fill("Robin Rae")
    await page.getByRole("button", { name: "Save", exact: true }).press("Enter")
    await expectWaitingWithFocus(page, page.getByRole("button", { name: "Saving…" }))
    saved.open()
    await expect(page.getByText("Saved", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeFocused()
  })

  test("the supplement sheet's Save, until the sheet closes and its row takes focus", async ({ page }) => {
    const saved = gate()
    const { row, sheet } = await openVitaminD(page, saved.opened)
    await sheet.getByLabel("Dose").fill("500 IU")
    const save = sheet.getByRole("button", { name: "Save", exact: true })
    await save.press("Enter")
    await expectWaitingWithFocus(page, save)
    saved.open()
    await expect(sheet).toBeHidden()
    await expect(row).toBeFocused()
  })

  test("the supplement sheet's Stop, until the sheet closes", async ({ page }) => {
    const saved = gate()
    const { sheet } = await openVitaminD(page, saved.opened)
    await sheet.getByRole("button", { name: "Stop giving it" }).press("Enter")
    const stop = sheet.getByRole("button", { name: "Stop", exact: true })
    await stop.press("Enter")
    await expectWaitingWithFocus(page, stop)
    saved.open()
    await expect(sheet).toBeHidden()
  })
})

const beforeAnyMessage = async (scope: Locator, fields: ReadonlyArray<Locator>) => {
  for (const field of fields) {
    await expect(field).toBeVisible()
    await expect(field).not.toHaveAttribute("aria-invalid", "true")
  }
  await scope.locator('[aria-live="polite"]').evaluateAll((regions) => {
    for (const region of regions) region.setAttribute("data-polite-before", "")
  })
}

interface Told {
  readonly about: ReadonlyArray<Locator>
  readonly notAbout?: ReadonlyArray<Locator>
  readonly stopsSave: boolean
}

const expectToldPolitely = async (scope: Locator, said: RegExp, { about, notAbout = [], stopsSave }: Told) => {
  for (const field of about) {
    await expect(field).toHaveAccessibleDescription(said)
    if (stopsSave) await expect(field).toHaveAttribute("aria-invalid", "true")
    else await expect(field).not.toHaveAttribute("aria-invalid", "true")
  }
  for (const field of notAbout) {
    await expect(field).not.toHaveAccessibleDescription(said)
    await expect(field).not.toHaveAttribute("aria-invalid", "true")
  }
  await expect(scope.locator("[data-polite-before]").filter({ hasText: said })).toHaveCount(1)
}

const nursedAnHourAgo = (by: string): FeedAnswer => ({
  id: "feed-1",
  status: "completed",
  startedAt: NOW - 90 * MINUTE,
  endedAt: NOW - 67 * MINUTE,
  segments: [
    { id: "s1", side: "left", startedAt: NOW - 90 * MINUTE, endedAt: NOW - 76 * MINUTE },
    { id: "s2", side: "right", startedAt: NOW - 76 * MINUTE, endedAt: NOW - 67 * MINUTE },
  ],
  portions: [],
  ...savedBy(by),
})

const openEditFeed = async (page: Page) => {
  const andrew = await inVancouver(page)
  await playHousehold(page, { ...todayWith(), recent: [{ kind: "feed", feed: nursedAnHourAgo(andrew) }] })
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /Nursing/u })
    .click()
  return page.getByRole("dialog", { name: "Edit feed" })
}

const refuseTheChild = async (page: Page, fieldError: { readonly path: string; readonly issue: string }) => {
  const { me } = await caregiversOf(page)
  await page.route("**/api/me", (route) => route.fulfill({ json: me }))
  await page.route("**/api/child", (route) =>
    route.fulfill({ status: 400, json: { _tag: "InvalidInput", fieldErrors: [fieldError] } }),
  )
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings")
  return page.locator("section", { has: page.getByRole("heading", { name: "Child", exact: true }) })
}

test.describe("a field's message describes each field it's about and is said politely, from a region that was there before it", () => {
  test("That's after this side ended., on a stopped side's start, which stops Save start", async ({ page }) => {
    await inVancouver(page)
    await playHousehold(page, todayWith(pausedAt(await runningFor(page), NOW - 5 * MINUTE)))
    const sheet = await openNursing(page)
    await sheet.getByRole("button", { name: "Change, Started" }).click()
    const started = sheet.getByLabel("Started", { exact: true })
    await beforeAnyMessage(sheet, [started])
    await started.fill("2026-10-09T09:28")
    await expectToldPolitely(sheet, /That's after this side ended\./u, { about: [started], stopsSave: true })
    await expect(sheet.getByRole("button", { name: "Save start" })).toBeDisabled()
  })

  test("Past feed's end in the future, on its start and both sides' minutes, which stops Save", async ({ page }) => {
    await inVancouver(page)
    await playHousehold(page, todayWith())
    await (await openNursing(page)).getByRole("button", { name: "Log a past feed" }).click()
    const sheet = page.getByRole("dialog", { name: "Past feed" })
    const left = sheet.getByRole("textbox", { name: "Left" })
    const fields = [sheet.getByLabel("Started", { exact: true }), left, sheet.getByRole("textbox", { name: "Right" })]
    await beforeAnyMessage(sheet, fields)
    await left.fill("45")
    await expectToldPolitely(sheet, /That would end at 9:45\sAM, in the future\./u, { about: fields, stopsSave: true })
    await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  test("a sleep longer than a day, on both its times, which stops Save", async ({ page }) => {
    await inVancouver(page)
    await playHousehold(page, todayWith())
    await openToday(page)
    await quickAction(page, "Sleep").click()
    await page.getByRole("dialog", { name: "Sleep" }).getByRole("button", { name: "Log a past sleep" }).click()
    const sheet = page.getByRole("dialog", { name: "Past sleep" })
    const fellAsleep = sheet.getByLabel("Fell asleep", { exact: true })
    const times = [fellAsleep, sheet.getByLabel("Woke", { exact: true })]
    await beforeAnyMessage(sheet, times)
    await fellAsleep.fill("2026-10-08T08:00")
    await expectToldPolitely(sheet, /A sleep can last a day at most\./u, { about: times, stopsSave: true })
    await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  test("Edit feed's issue, on the fields of each part it's about and no others, which stops Save", async ({ page }) => {
    const sheet = await openEditFeed(page)
    const first = sheet.getByRole("group", { name: "Side 1" })
    const second = sheet.getByRole("group", { name: "Side 2" })
    const firstStart = first.getByLabel("Started", { exact: true })
    const firstMinutes = first.getByLabel("Minutes", { exact: true })
    const secondStart = second.getByLabel("Started", { exact: true })
    const secondMinutes = second.getByLabel("Minutes", { exact: true })
    const sides = [firstStart, firstMinutes, secondStart, secondMinutes]
    await beforeAnyMessage(sheet, sides)
    await firstMinutes.fill("0")
    await expectToldPolitely(sheet, /Give each side 1 to 240 minutes\./u, {
      about: [firstMinutes],
      notAbout: [firstStart, secondStart, secondMinutes],
      stopsSave: true,
    })
    await firstMinutes.fill("14")
    await secondStart.fill("2026-10-09T08:05")
    await expectToldPolitely(sheet, /Two sides overlap\. Move one so they don't\./u, { about: sides, stopsSave: true })
    await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  test("Edit feed's move, on Feed started, which only informs", async ({ page }) => {
    const sheet = await openEditFeed(page)
    const feedStarted = sheet.getByLabel("Feed started", { exact: true })
    await beforeAnyMessage(sheet, [feedStarted])
    await feedStarted.fill("2026-10-09T07:00")
    await expectToldPolitely(sheet, /Moves every side and bottle 1 h earlier\./u, {
      about: [feedStarted],
      stopsSave: false,
    })
    await expect(sheet.getByRole("button", { name: "Save" })).toBeEnabled()
  })

  test("a birth date the household refused, on the birth date alone", async ({ page }) => {
    const child = await refuseTheChild(page, { path: "birthDate", issue: "before_birth" })
    const birthDate = child.getByLabel("Birth date", { exact: true })
    await beforeAnyMessage(child, [birthDate])
    await birthDate.fill("2026-09-04")
    await child.getByRole("button", { name: "Save", exact: true }).click()
    await expectToldPolitely(child, /Some entries are from before this date\. Move or delete them first\./u, {
      about: [birthDate],
      notAbout: [child.getByLabel("Name", { exact: true })],
      stopsSave: true,
    })
  })

  test("a Born at that can't be saved, on its weeks and its days", async ({ page }) => {
    const child = await refuseTheChild(page, { path: "gestationalAgeDays", issue: "invalid" })
    const weeks = child.getByRole("spinbutton", { name: "weeks", exact: true })
    const days = child.getByRole("spinbutton", { name: "days", exact: true })
    await beforeAnyMessage(child, [weeks, days])
    await weeks.fill("50")
    await child.getByRole("button", { name: "Save", exact: true }).click()
    await expectToldPolitely(child, /Enter 22 to 44 weeks and 0 to 6 days\./u, {
      about: [weeks, days],
      stopsSave: true,
    })
  })

  test("a weight out of range, on the weight alone, which stops Save", async ({ page }) => {
    const { me } = await caregiversOf(page)
    const household = { ...me.household, units: { ...me.household.units, weight: "kg", length: "cm" } }
    await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household } }))
    await page.route("**/api/growth", (route) => route.fulfill({ json: { measurements: [] } }))
    await page.clock.setFixedTime(NOW)
    await page.goto("/growth")
    await page.getByRole("button", { name: "Add measurement" }).click()
    const sheet = page.getByRole("dialog", { name: "Add measurement" })
    const weight = sheet.getByRole("textbox", { name: "Weight" })
    await beforeAnyMessage(sheet, [weight])
    await weight.fill("4325")
    await expectToldPolitely(sheet, /Out of range\. Check the number and its unit\./u, {
      about: [weight],
      notAbout: [sheet.getByRole("textbox", { name: "Length" })],
      stopsSave: true,
    })
    await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  test("Past feed's minutes that won't read, on that side's minutes alone, and nothing for a blank one", async ({
    page,
  }) => {
    await inVancouver(page)
    await playHousehold(page, todayWith())
    await (await openNursing(page)).getByRole("button", { name: "Log a past feed" }).click()
    const sheet = page.getByRole("dialog", { name: "Past feed" })
    const left = sheet.getByRole("textbox", { name: "Left" })
    const right = sheet.getByRole("textbox", { name: "Right" })
    await beforeAnyMessage(sheet, [left, right])
    await left.fill("12a")
    await expectToldPolitely(sheet, /Enter a number\./u, { about: [left], notAbout: [right], stopsSave: true })
    await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
    await left.fill("241")
    await expectToldPolitely(sheet, /Out of range\. Check the number and its unit\./u, {
      about: [left],
      notAbout: [right],
      stopsSave: true,
    })
    await left.fill("")
    await expect(left).not.toHaveAccessibleDescription(/Enter a number|Out of range/u)
    await expect(left).not.toHaveAttribute("aria-invalid", "true")
  })

  test("Bottle's amount that won't read, on that amount alone, which stops Save", async ({ page }) => {
    await playHousehold(page, todayWith())
    await openToday(page)
    await quickAction(page, "Bottle").click()
    const sheet = page.getByRole("dialog", { name: "Bottle" })
    const formula = sheet.getByRole("textbox", { name: "Formula" })
    const breastMilk = sheet.getByRole("textbox", { name: "Breast milk" })
    await beforeAnyMessage(sheet, [formula, breastMilk])
    await formula.fill("1.2.3")
    await expectToldPolitely(sheet, /Enter a number\./u, { about: [formula], notAbout: [breastMilk], stopsSave: true })
    await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
  })
})

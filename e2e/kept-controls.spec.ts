import type { Locator, Page } from "@playwright/test"
import {
  caregiversOf,
  type FeedAnswer,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  runningSleep,
  savedDiaper,
  type SleepAnswer,
  sleepingToday,
  type TodayAnswer,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

const STARTED = NOW - 40 * MINUTE
const RELOADED = NOW + 15 * MINUTE

interface Body {
  readonly occurredAt?: number
}

interface Control {
  readonly name: string
  readonly sheet: "Sleep" | "Nursing"
  readonly today: (by: string) => TodayAnswer
  readonly route: string
  readonly saved: (by: string) => (body: Body) => object
  readonly tap: (sheet: Locator) => Promise<void>
  readonly note: RegExp
  readonly sentAgainBy: string
}

const sleeping = (by: string) => sleepingToday(runningSleep(by, STARTED))

const feeding = (by: string) => todayWith(runningFeed(by, STARTED, "left"))

const sleepSaved = (sleep: SleepAnswer) => ({ sleep: { ...sleep, version: 2 }, changed: [] })

const stopped = (feed: FeedAnswer, at: number): FeedAnswer => ({
  ...feed,
  segments: feed.segments.map((segment) => ({ ...segment, endedAt: at })),
  version: 2,
})

const WAKE_UP: Control = {
  name: "a wake-up",
  sheet: "Sleep",
  today: sleeping,
  route: "**/api/sleeps/sleep-1/wake",
  saved: (by) => (body) => sleepSaved({ ...runningSleep(by, STARTED), endedAt: body.occurredAt ?? NOW }),
  tap: (sheet) => sheet.getByRole("button", { name: "Wake up", exact: true }).click(),
  note: /^The wake-up wasn't saved, Fri 9:30\sAM\. Save it now\?Save now$/u,
  sentAgainBy: "Wake up",
}

const CONTROLS: ReadonlyArray<Control> = [
  WAKE_UP,
  {
    name: "Nap or night",
    sheet: "Sleep",
    today: sleeping,
    route: "**/api/sleeps/sleep-1",
    saved: (by) => () => sleepSaved(runningSleep(by, STARTED, "night")),
    tap: (sheet) => sheet.getByRole("button", { name: "Night", exact: true }).click(),
    note: /^Your changes weren't saved, Fri 9:30\sAM\. Save them now\?Save now$/u,
    sentAgainBy: "Save now",
  },
  {
    name: "a sleep's delete",
    sheet: "Sleep",
    today: sleeping,
    route: "**/api/sleeps/sleep-1",
    saved: (by) => () => sleepSaved({ ...runningSleep(by, STARTED), deletedAt: NOW }),
    tap: async (sheet) => {
      await sheet.getByRole("button", { name: "Delete sleep" }).click()
      await sheet.getByRole("button", { name: "Delete", exact: true }).click()
    },
    note: /^The delete wasn't saved, Fri 9:30\sAM\. Save it now\?Save now$/u,
    sentAgainBy: "Save now",
  },
  {
    name: "a pause",
    sheet: "Nursing",
    today: feeding,
    route: "**/api/feeds/feed-1/pause",
    saved: (by) => (body) => ({ feed: stopped(runningFeed(by, STARTED, "left"), body.occurredAt ?? NOW), changed: [] }),
    tap: (sheet) => sheet.getByRole("button", { name: "Pause", exact: true }).click(),
    note: /^The pause wasn't saved, Fri 9:30\sAM\. Save it now\?Save now$/u,
    sentAgainBy: "Pause",
  },
  {
    name: "a finish",
    sheet: "Nursing",
    today: feeding,
    route: "**/api/feeds/feed-1/finish",
    saved: (by) => (body) => {
      const at = body.occurredAt ?? NOW
      return {
        feed: { ...stopped(runningFeed(by, STARTED, "left"), at), status: "completed", endedAt: at },
        changed: [],
      }
    },
    tap: async (sheet) => {
      await sheet.getByRole("button", { name: "Finish", exact: true }).click()
      await sheet.getByRole("button", { name: "Finish feed", exact: true }).click()
    },
    note: /^The finish wasn't saved, Fri 9:30\sAM\. Save it now\?Save now$/u,
    sentAgainBy: "Finish feed",
  },
]

const keptOnThePhone = (page: Page) => page.evaluate(() => localStorage.getItem("bt.kept"))

const loseTheFirstSend = async (page: Page, pattern: string, answer: (body: Body) => object) => {
  const bodies: Body[] = []
  await page.route(pattern, async (route) => {
    const body: Body = route.request().postDataJSON() ?? {}
    bodies.push(body)
    if (bodies.length === 1) return route.abort("internetdisconnected")
    return route.fulfill({ status: 200, json: answer(body) })
  })
  return bodies
}

const failThenReload = async (page: Page, control: Control) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, control.today(andrew.id))
  const sent = await loseTheFirstSend(page, control.route, control.saved(andrew.id))
  await openToday(page)
  await quickAction(page, control.sheet).click()
  const sheet = page.getByRole("dialog", { name: control.sheet })
  await control.tap(sheet)
  await expect(sheet.getByRole("alert").filter({ hasText: "No connection" })).toHaveText(
    "No connection. This is kept on this phone: try again once you're back online.Try again",
  )
  await page.clock.setFixedTime(RELOADED)
  await page.reload()
  await expect(sheet.getByRole("alert")).toHaveText(control.note)
  return { sheet, sent }
}

for (const control of CONTROLS) {
  test(`keeps ${control.name} that failed with no connection through a reload, and ${control.sentAgainBy} sends it as it was first tapped`, async ({
    page,
  }) => {
    const { sheet, sent } = await failThenReload(page, control)
    expect(sent).toHaveLength(1)
    await sheet.getByRole("button", { name: control.sentAgainBy, exact: true }).click()
    await expect.poll(() => sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    await expect.poll(() => keptOnThePhone(page)).toBeNull()
    await page.reload()
    await page.getByText("Totals").waitFor()
    await expect(sheet).toBeHidden()
    expect(sent).toHaveLength(2)
  })
}

test("lets a kept wake-up go for good once it's discarded", async ({ page }) => {
  const { sheet, sent } = await failThenReload(page, WAKE_UP)
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText(/^Discard the wake-up at 9:30\sAM\?DiscardKeep$/u)
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect(sheet).toBeHidden()
  await page.reload()
  await page.getByText("Totals").waitFor()
  await expect(sheet).toBeHidden()
  expect(sent).toHaveLength(1)
})

test("lets a kept pause go for good once a later Switch replaces it", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left")
  const switched: FeedAnswer = {
    ...stopped(feed, NOW),
    segments: [...stopped(feed, NOW).segments, { id: "segment-2", side: "right", startedAt: NOW, endedAt: null }],
  }
  const { played, answer } = await playHousehold(page, todayWith(feed))
  const paused = await loseTheFirstSend(page, "**/api/feeds/feed-1/pause", (body) => ({
    feed: stopped(feed, body.occurredAt ?? NOW),
    changed: [],
  }))
  await answer("**/api/feeds/feed-1/switch", () => {
    played.today = todayWith(switched)
    return { status: 200, json: { feed: switched, changed: [] } }
  })
  await openToday(page)
  await quickAction(page, "Nursing").click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await sheet.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection. This is kept on this phone:")
  await sheet.getByRole("button", { name: "Switch to Right" }).click()
  await expect.poll(() => played.sent.length).toBe(1)
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await expect.poll(() => keptOnThePhone(page)).toBeNull()
  await page.reload()
  await page.getByText("Totals").waitFor()
  await expect(sheet).toBeHidden()
  expect(paused).toHaveLength(1)
})

test("keeps a kept wake-up on the phone while it's sent again, even when a diaper is logged before it lands", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const { answer } = await playHousehold(page, sleeping(andrew.id))
  await answer("**/api/diapers", ({ body }) => ({ status: 201, json: savedDiaper(andrew.id)(body) }))
  const woke: Body[] = []
  await page.route("**/api/sleeps/sleep-1/wake", async (route) => {
    woke.push(route.request().postDataJSON() ?? {})
    if (woke.length === 1) await route.abort("internetdisconnected")
  })
  await openToday(page)
  await quickAction(page, "Sleep").click()
  const sheet = page.getByRole("dialog", { name: "Sleep" })
  await sheet.getByRole("button", { name: "Wake up", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection. This is kept on this phone:")
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect.poll(() => woke.length).toBe(2)
  await quickAction(page, "Diaper").click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Pee" }).click()
  await expect(page.getByText("Diaper saved")).toBeVisible()
  expect(await keptOnThePhone(page)).toContain("wakeSleep")
  await page.reload()
  await expect(sheet.getByRole("alert")).toHaveText(
    /^The wake-up (?:might not have been|wasn't) saved, Fri 9:30\sAM\. Save it now\?Save now$/u,
  )
})

test("sends a sign-in draft again at startup, kept on the phone until it lands, while another kept control waits on its sheet", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, feeding(andrew.id))
  const pause = {
    sheet: "nursing",
    action: {
      kind: "pauseFeed",
      id: "feed-1",
      payload: { actionId: "3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f", version: 1, occurredAt: NOW - 2 * MINUTE },
    },
  }
  const startChange = {
    sheet: "nursing",
    action: {
      kind: "editSegment",
      id: "segment-1",
      payload: {
        actionId: "8e7d6c5b-4a39-4281-9f0e-1d2c3b4a5968",
        version: 1,
        side: "left",
        startedAt: STARTED - 5 * MINUTE,
        endedAt: null,
      },
    },
  }
  const kept = [pause, startChange].map((sending) => ({
    sending,
    keptAt: NOW - 2 * MINUTE,
    idSince: NOW - 2 * MINUTE,
    failed: true,
  }))
  const draft = { route: "/", sending: startChange, createdAt: NOW - MINUTE }
  await page.addInitScript((stored) => localStorage.setItem("bt.kept", stored), JSON.stringify(kept))
  await page.addInitScript((stored) => sessionStorage.setItem("bt.draft", stored), JSON.stringify(draft))
  const changed: Body[] = []
  await page.route("**/api/segments/segment-1", (route) => {
    changed.push(route.request().postDataJSON() ?? {})
  })
  await openToday(page)
  await expect(page.getByRole("dialog", { name: "Nursing" }).getByRole("alert")).toHaveText(
    /^The pause wasn't saved, Fri 9:28\sAM\. Save it now\?Save now$/u,
  )
  await expect.poll(() => changed.length).toBe(1)
  expect(changed[0]).toEqual(startChange.action.payload)
  await expect.poll(() => keptOnThePhone(page)).toContain("editSegment")
})

import type { Page } from "@playwright/test"
import {
  caregiversOf,
  MINUTE,
  muteLiveUpdates,
  NOW,
  openToday,
  playHousehold,
  type SleepAnswer,
  sleepingToday,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const HOUR = 60 * MINUTE
const recent = (page: Page) => page.getByRole("list", { name: "Last 24 hours" })

test.use({ timezoneId: "Europe/London" })

const napOf = (by: string): SleepAnswer => ({
  id: "sleep-1",
  kind: "nap",
  startedAt: NOW - 90 * MINUTE + 17_000,
  endedAt: NOW - 10 * MINUTE + 41_000,
  version: 2,
  createdBy: by,
  createdAt: NOW - 90 * MINUTE,
  updatedBy: by,
  updatedAt: NOW - 10 * MINUTE,
  deletedAt: null,
})

test("logs a past sleep from the sleep sheet: the hour before now, a nap by its start, with Undo", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { played, answer } = await playHousehold(page, todayWith())
  await answer("**/api/sleeps", ({ body }) => {
    const sleep = { ...napOf(andrew.id), startedAt: body.startedAt ?? 0, endedAt: body.endedAt ?? 0, version: 1 }
    played.today = sleepingToday(sleep)
    return { status: 201, json: { sleep, changed: [["today"]] } }
  })
  await muteLiveUpdates(page)
  await openToday(page)
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Sleep" }).click()
  await page.getByRole("dialog", { name: "Sleep" }).getByRole("button", { name: "Log a past sleep" }).click()
  const sheet = page.getByRole("dialog", { name: "Past sleep" })
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "POST",
        path: "/api/sleeps",
        body: { actionId: ACTION_ID, kind: "nap", startedAt: NOW - HOUR, endedAt: NOW },
      },
    ])
  await expect(page.getByText("Sleep saved")).toBeVisible()
  await expect(
    page.getByRole("status").filter({ hasText: "Sleep saved" }).getByRole("button", { name: "Undo" }),
  ).toBeVisible()
  await expect(page.getByText("Since she woke")).toBeVisible()
})

test("edits a finished sleep from Today's list, keeping its start to the second, with its version", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const nap = napOf(andrew.id)
  const { played, answer } = await playHousehold(page, sleepingToday(nap))
  await answer("**/api/sleeps/sleep-1", ({ body }) => {
    const sleep = { ...nap, kind: body.kind ?? nap.kind, endedAt: body.endedAt ?? nap.endedAt, version: 3 }
    played.today = sleepingToday(sleep)
    return { status: 200, json: { sleep, changed: [["today"]] } }
  })
  await muteLiveUpdates(page)
  await openToday(page)
  await recent(page).getByRole("button", { name: /Nap/u }).click()
  const sheet = page.getByRole("dialog", { name: "Edit sleep" })
  await sheet.getByLabel("Woke").fill("2026-10-09T09:25")
  await sheet.getByRole("button", { name: "Night", exact: true }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "PATCH",
        path: "/api/sleeps/sleep-1",
        body: {
          actionId: ACTION_ID,
          version: 2,
          kind: "night",
          startedAt: nap.startedAt,
          endedAt: Date.UTC(2026, 9, 9, 16, 25),
        },
      },
    ])
  await expect(recent(page)).toContainText("Night")
})

test("says who changed the sleep first, and saves mine on top of theirs when asked", async ({ page }) => {
  const { andrew, emily } = await caregiversOf(page)
  const nap = napOf(andrew.id)
  const theirs = { ...nap, kind: "night" as const, version: 3, updatedBy: emily.id }
  const { played, answer } = await playHousehold(page, sleepingToday(nap))
  await answer("**/api/sleeps/sleep-1", ({ body }) => {
    if (played.sent.length === 1) {
      played.today = sleepingToday(theirs)
      return { status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } }
    }
    const mine = { ...theirs, kind: body.kind ?? theirs.kind, version: 4 }
    played.today = sleepingToday(mine)
    return { status: 200, json: { sleep: mine, changed: [["today"]] } }
  })
  await muteLiveUpdates(page)
  await openToday(page)
  await recent(page).getByRole("button", { name: /Nap/u }).click()
  const sheet = page.getByRole("dialog", { name: "Edit sleep" })
  await sheet.getByLabel("Woke").fill("2026-10-09T09:25")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this a moment ago.`)
  await expect(sheet.getByRole("alert")).toContainText(/It now reads: Night at 8:00\sAM/u)
  await sheet.getByRole("button", { name: "Save mine anyway" }).click()
  await expect(sheet).toBeHidden()
  const [first, second] = played.sent.map(({ body }) => body)
  expect(second).toEqual({ ...first, version: 3 })
})

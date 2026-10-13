import { expect, type Page, test } from "@playwright/test"
import {
  caregiversOf,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  runningSleep,
  sleepingToday,
  todayWith,
} from "./played-household.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const FELL_ASLEEP = NOW - 42 * MINUTE

test.use({ timezoneId: "Europe/London" })

const openSleep = async (page: Page) => {
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Sleep" }).click()
  return page.getByRole("dialog", { name: "Sleep" })
}

test("starts a sleep in two taps, a nap by the household's clock at 9:30 AM", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { played, answer } = await playHousehold(page, todayWith())
  await answer("**/api/sleeps/start", () => {
    const sleep = runningSleep(andrew.id, NOW)
    played.today = sleepingToday(sleep)
    return { status: 201, json: { sleep, changed: [["today"]] } }
  })
  await openToday(page)
  await expect(page.getByText("No sleeps yet")).toBeVisible()
  const sheet = await openSleep(page)
  await expect(sheet.getByRole("button", { name: "Nap", exact: true })).toHaveAttribute("aria-pressed", "true")
  await sheet.getByRole("button", { name: "Start sleep" }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      { method: "POST", path: "/api/sleeps/start", body: { actionId: ACTION_ID, kind: "nap", startedAt: NOW } },
    ])
  await expect(sheet).toBeHidden()
  await expect(page.getByText("Asleep now · Nap")).toBeVisible()
})

test("wakes her in two taps, at the tap's time and the sleep's version, then counts the time since", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const sleep = runningSleep(andrew.id, FELL_ASLEEP, "nap", 2)
  const { played, answer } = await playHousehold(page, sleepingToday(sleep))
  await answer("**/api/sleeps/sleep-1/wake", ({ body }) => {
    const woken = { ...sleep, endedAt: body.occurredAt ?? NOW, version: 3 }
    played.today = sleepingToday(woken)
    return { status: 200, json: { sleep: woken, changed: [["today"]] } }
  })
  await openToday(page)
  await expect(page.getByRole("timer")).toHaveText("42:00")
  const sheet = await openSleep(page)
  await sheet.getByRole("button", { name: "Wake up" }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "POST",
        path: "/api/sleeps/sleep-1/wake",
        body: { actionId: ACTION_ID, version: 2, occurredAt: NOW },
      },
    ])
  await expect(page.getByText("Since she woke")).toBeVisible()
  await expect(page.getByText(/Nap 42 min/u)).toBeVisible()
})

test("wakes her at the time she woke when the tap comes later, but not before she fell asleep", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const sleep = runningSleep(andrew.id, FELL_ASLEEP, "nap", 2)
  const { played, answer } = await playHousehold(page, sleepingToday(sleep))
  await answer("**/api/sleeps/sleep-1/wake", ({ body }) => {
    const woken = { ...sleep, endedAt: body.occurredAt ?? NOW, version: 3 }
    played.today = sleepingToday(woken)
    return { status: 200, json: { sleep: woken, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openSleep(page)
  await sheet.getByRole("button", { name: "Change" }).last().click()
  await sheet.getByLabel("Woke").fill("2026-10-09T08:40")
  await expect(sheet.getByText("Pick a time after she fell asleep.")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Wake up" })).toBeDisabled()
  await sheet.getByLabel("Woke").fill("2026-10-09T09:10")
  await sheet.getByRole("button", { name: "Wake up" }).click()
  await expect.poll(() => played.sent.map(({ body }) => body.occurredAt)).toEqual([Date.UTC(2026, 9, 9, 16, 10)])
  await expect(page.getByText("Since she woke")).toBeVisible()
  await expect(page.getByText("20 min")).toBeVisible()
})

test("calls a sleep that fell at 6:30 AM a night, until a parent picks nap", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { played, answer } = await playHousehold(page, todayWith())
  await answer("**/api/sleeps/start", ({ body }) => {
    const sleep = runningSleep(andrew.id, body.startedAt ?? NOW, body.kind ?? "nap")
    played.today = sleepingToday(sleep)
    return { status: 201, json: { sleep, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openSleep(page)
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Fell asleep").fill("2026-10-09T06:30")
  await expect(sheet.getByRole("button", { name: "Night", exact: true })).toHaveAttribute("aria-pressed", "true")
  await sheet.getByRole("button", { name: "Nap", exact: true }).click()
  await sheet.getByRole("button", { name: "Start sleep" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => [body.kind, body.startedAt]))
    .toEqual([["nap", Date.UTC(2026, 9, 9, 13, 30)]])
})

test("keeps Nap once a parent taps it, even when the start then moves into the night", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { played, answer } = await playHousehold(page, todayWith())
  await answer("**/api/sleeps/start", ({ body }) => {
    const sleep = runningSleep(andrew.id, body.startedAt ?? NOW, body.kind ?? "nap")
    played.today = sleepingToday(sleep)
    return { status: 201, json: { sleep, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openSleep(page)
  const nap = sheet.getByRole("button", { name: "Nap", exact: true })
  await expect(nap).toHaveAttribute("aria-pressed", "true")
  await nap.click()
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Fell asleep").fill("2026-10-08T19:30")
  await expect(nap).toHaveAttribute("aria-pressed", "true")
  await sheet.getByRole("button", { name: "Start sleep" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => [body.kind, body.startedAt]))
    .toEqual([["nap", Date.UTC(2026, 9, 9, 2, 30)]])
})

test("moves a running sleep's start, and changes it to a night, each with its version", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  let sleep = runningSleep(andrew.id, FELL_ASLEEP, "nap", 2)
  const { played, answer } = await playHousehold(page, sleepingToday(sleep))
  await answer("**/api/sleeps/sleep-1", ({ body }) => {
    sleep = {
      ...sleep,
      kind: body.kind ?? sleep.kind,
      startedAt: body.startedAt ?? sleep.startedAt,
      version: sleep.version + 1,
    }
    played.today = sleepingToday(sleep)
    return { status: 200, json: { sleep, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openSleep(page)
  await sheet.getByRole("button", { name: "Night", exact: true }).click()
  await expect(sheet.getByText("Asleep · Night")).toBeVisible()
  await sheet.getByRole("button", { name: "Change" }).first().click()
  await sheet.getByLabel("Fell asleep").fill("2026-10-09T08:30")
  await sheet.getByRole("button", { name: "Save start" }).click()
  await expect
    .poll(() => played.sent.map(({ method, body }) => [method, body.version, body.kind, body.startedAt, body.endedAt]))
    .toEqual([
      ["PATCH", 2, "night", FELL_ASLEEP, null],
      ["PATCH", 3, "night", Date.UTC(2026, 9, 9, 15, 30), null],
    ])
})

test("sends nothing when a parent taps the label a running sleep already has", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  let sleep = runningSleep(andrew.id, FELL_ASLEEP, "nap", 2)
  const { played, answer } = await playHousehold(page, sleepingToday(sleep))
  await answer("**/api/sleeps/sleep-1", ({ body }) => {
    sleep = {
      ...sleep,
      kind: body.kind ?? sleep.kind,
      startedAt: body.startedAt ?? sleep.startedAt,
      version: sleep.version + 1,
    }
    played.today = sleepingToday(sleep)
    return { status: 200, json: { sleep, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openSleep(page)
  await sheet.getByRole("button", { name: "Nap", exact: true }).click()
  await sheet.getByRole("button", { name: "Night", exact: true }).click()
  await expect
    .poll(() => played.sent.map(({ method, body }) => [method, body.version, body.kind]))
    .toEqual([["PATCH", 2, "night"]])
})

test("deletes a running sleep after asking, and offers Undo", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const sleep = runningSleep(andrew.id, FELL_ASLEEP)
  const { played, answer } = await playHousehold(page, sleepingToday(sleep))
  await answer("**/api/sleeps/sleep-1", () => {
    played.today = todayWith()
    return { status: 200, json: { sleep: { ...sleep, deletedAt: NOW, version: 2 }, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openSleep(page)
  await sheet.getByRole("button", { name: "Delete sleep" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.getByText("Sleep deleted")).toBeVisible()
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible()
  await expect(page.getByText("No sleeps yet")).toBeVisible()
})

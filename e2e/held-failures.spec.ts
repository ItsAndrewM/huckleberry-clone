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

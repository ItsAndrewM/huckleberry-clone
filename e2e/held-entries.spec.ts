import { expect, test } from "@playwright/test"
import {
  caregiversOf,
  gate,
  holdRequests,
  loseSaves,
  muteLiveUpdates,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  savedBy,
  savedDiaper,
  type Sent,
  todayWith,
} from "./played-household.ts"

const LAST_BOTTLE = { lastBottle: { breastMilkMl: 40, formulaMl: 20 }, lastSide: null }

const savedBottle = (by: string) => (body: Sent["body"]) => {
  const portions = (body.portions ?? []).map((portion, index) => ({ id: `portion-${index}`, ...portion }))
  const at = portions[0]?.occurredAt ?? NOW
  const feed = { id: `feed-${body.actionId}`, status: "completed", startedAt: at, endedAt: at, segments: [] }
  return { feed: { ...feed, portions, ...savedBy(by) }, changed: [["today"]] }
}

test("offers back a diaper and a bottle that failed together, one after the other, each with its own values", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith(null, LAST_BOTTLE))
  const diaperLost = gate()
  const bottleLost = gate()
  const diapers = await loseSaves(page, "**/api/diapers", {
    lost: 1,
    until: diaperLost.opened,
    answer: savedDiaper(andrew.id),
  })
  const bottles = await loseSaves(page, "**/api/feeds", {
    lost: 1,
    until: bottleLost.opened,
    answer: savedBottle(andrew.id),
  })
  await muteLiveUpdates(page)
  await openToday(page)
  const diaper = page.getByRole("dialog", { name: "Diaper" })
  const bottle = page.getByRole("dialog", { name: "Bottle" })
  await quickAction(page, "Diaper").click()
  await diaper.getByRole("button", { name: "Pee" }).click()
  await expect(diaper).toBeHidden()
  await quickAction(page, "Bottle").click()
  await bottle.getByRole("button", { name: "More breast milk" }).click()
  await bottle.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saving…")).toHaveCount(2)
  const reload = gate()
  const reloads = await holdRequests(page, "**/api/today", () => reload.opened)
  diaperLost.open()
  await expect(diaper.getByRole("alert")).toContainText("No connection")
  bottleLost.open()
  await expect.poll(() => reloads.length).toBe(2)
  await expect(page.getByText("Saving…")).toHaveCount(0)
  await expect(bottle).toBeHidden()
  await diaper.getByRole("button", { name: "Try again" }).click()
  await expect(diaper).toBeHidden()
  await expect(bottle.getByRole("alert")).toContainText("No connection")
  await expect(bottle.getByRole("textbox", { name: "Breast milk" })).toHaveValue("50")
  await bottle.getByRole("button", { name: "Try again" }).click()
  await expect(bottle).toBeHidden()
  reload.open()
  await expect(page.getByText("Saving…")).toHaveCount(0)
  expect(diapers.map(({ actionId }) => actionId)).toEqual([diapers[0]?.actionId, diapers[0]?.actionId])
  expect(bottles.map(({ portions }) => portions?.[0]?.breastMilkMl)).toEqual([50, 50])
})

test("offers the second of two failed diapers in its own form once the first is saved", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const lost = gate()
  const sent = await loseSaves(page, "**/api/diapers", { lost: 2, until: lost.opened, answer: savedDiaper(andrew.id) })
  await muteLiveUpdates(page)
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet).toBeHidden()
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Poo" }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => sent.length).toBe(2)
  lost.open()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByText("Diaper saved")).toBeVisible()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "Both" }).click()
  await expect.poll(() => sent.length).toBe(4)
  const [pee, poo, retried, both] = sent
  expect(retried).toEqual(pee)
  expect(both).toEqual({ ...poo, wet: true, dirty: true })
})

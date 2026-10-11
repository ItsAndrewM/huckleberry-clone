import { expect, test } from "@playwright/test"
import { openToday, playHousehold, quickAction, todayWith } from "./played-household.ts"

const ABOVE_THE_SHEET = { x: 196, y: 40 }

test("asks before a failed entry is dismissed: Keep goes back to it, Discard lets it go", async ({ page }) => {
  await playHousehold(page, todayWith())
  await page.route("**/api/diapers", (route) => route.fulfill({ status: 500, json: {} }))
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Poo" }).click()
  await expect(sheet.getByRole("alert")).toHaveText("Not saved.Try again")
  await page.keyboard.press("Escape")
  await expect(sheet.getByRole("alert")).toHaveText("Discard this entry?DiscardKeep")
  await sheet.getByRole("button", { name: "Keep" }).click()
  await expect(sheet.getByRole("alert")).toHaveText("Not saved.Try again")
  await page.mouse.click(ABOVE_THE_SHEET.x, ABOVE_THE_SHEET.y)
  await expect(sheet.getByRole("alert")).toHaveText("Discard this entry?DiscardKeep")
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect(sheet).toBeHidden()
  await quickAction(page, "Diaper").click()
  await expect(sheet.getByRole("button", { name: "Poo" })).toBeVisible()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
})

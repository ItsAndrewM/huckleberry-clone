import { expect, test } from "@playwright/test"
import {
  caregiversOf,
  loseSaves,
  muteLiveUpdates,
  openToday,
  playHousehold,
  quickAction,
  savedDiaper,
  todayWith,
} from "./played-household.ts"

test("closes a sheet kept open offline once its save lands, and offers the Undo", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const sent = await loseSaves(page, "**/api/diapers", {
    lost: 1,
    until: Promise.resolve(),
    answer: savedDiaper(andrew.id),
  })
  let linkDown = false
  await page.route("**/api/**", (route) =>
    linkDown && route.request().method() === "GET" ? route.abort("internetdisconnected") : route.fallback(),
  )
  await muteLiveUpdates(page)
  await openToday(page)
  linkDown = true
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await expect(page.getByText("Entries can't be saved or refreshed until you're back online.")).toBeVisible()
  linkDown = false
  await sheet.getByRole("button", { name: "Try again" }).click()
  await expect(sheet).toBeHidden()
  await expect(
    page.getByRole("status").filter({ hasText: "Diaper saved" }).getByRole("button", { name: "Undo" }),
  ).toBeVisible()
  expect(sent).toHaveLength(2)
})

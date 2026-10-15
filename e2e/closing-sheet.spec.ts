import {
  caregiversOf,
  loseSaves,
  openToday,
  playHousehold,
  quickAction,
  savedDiaper,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

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

test("saves once when the sheet is tapped twice as it closes", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const sent = await loseSaves(page, "**/api/diapers", {
    lost: 0,
    until: Promise.resolve(),
    answer: savedDiaper(andrew.id),
  })
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  const pee = sheet.getByRole("button", { name: "Pee" })
  await quickAction(page, "Diaper").click()
  await pee.click({ trial: true })
  const box = await pee.boundingBox()
  if (box === null) throw new Error("Pee isn't laid out")
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 })
  await expect(sheet).toBeHidden()
  await expect(page.getByRole("status").filter({ hasText: "Diaper saved" })).toBeVisible()
  expect(sent).toHaveLength(1)
})

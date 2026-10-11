import { expect, type Page, test } from "@playwright/test"
import { caregiversOf, openToday, playHousehold, quickAction, savedDiaper, todayWith } from "./played-household.ts"

const SIGNED_OUT_COOKIE = "bt-preview-signed-out"
const ABOVE_THE_SHEET = { x: 196, y: 40 }
const PAGE_SURVIVES_SIGN_IN = `addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest('a[href^="/api/login"]')) event.preventDefault()
})`

const draftKept = (page: Page) => page.evaluate(() => sessionStorage.getItem("bt.draft"))

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

test("drops the sign-in draft of an entry discarded after Sign in, so the next load doesn't send it", async ({
  page,
  context,
  baseURL,
}) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  let signedOut = false
  const sent: string[] = []
  await page.route("**/api/diapers", (route) => {
    const body = route.request().postDataJSON()
    sent.push(body.actionId)
    return signedOut ? route.continue() : route.fulfill({ status: 201, json: savedDiaper(andrew.id)(body) })
  })
  await openToday(page)
  await page.evaluate(PAGE_SURVIVES_SIGN_IN)
  signedOut = true
  await context.addCookies([{ name: SIGNED_OUT_COOKIE, value: "1", url: baseURL ?? "" }])
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Your sign-in has expired")
  await sheet.getByRole("link", { name: "Sign in" }).click()
  await expect.poll(() => draftKept(page)).not.toBeNull()
  await page.keyboard.press("Escape")
  await sheet.getByRole("button", { name: "Discard" }).click()
  await expect(sheet).toBeHidden()
  expect(await draftKept(page)).toBeNull()
  signedOut = false
  await context.clearCookies()
  await page.reload()
  await expect(page.getByText("Nothing logged in the last 24 hours.")).toBeVisible()
  expect(sent).toHaveLength(1)
})

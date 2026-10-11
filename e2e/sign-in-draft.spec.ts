import { expect, type Page, test } from "@playwright/test"
import { NOW, openToday, playHousehold, type TodayAnswer, todayWith } from "./played-household.ts"

const SIGNED_OUT_COOKIE = "bt-preview-signed-out"
const HOUR = 3_600_000
const OLD_ACTION_ID = "00000000-0000-4000-8000-000000000000"

const diaperFrom = ({ occurredAt = NOW, wet = true, dirty = false }) => ({
  id: "diaper-1",
  occurredAt,
  wet,
  dirty,
  version: 1,
  createdBy: "caregiver",
  createdAt: NOW,
  updatedBy: "caregiver",
  updatedAt: NOW,
  deletedAt: null,
})

const recordDiapers = async (page: Page, played: { today: TodayAnswer }, signedOut: () => boolean) => {
  const sent: Array<{ actionId: string; occurredAt: number; dirty: boolean }> = []
  await page.route("**/api/diapers", async (route) => {
    const body = route.request().postDataJSON()
    sent.push({ actionId: body.actionId, occurredAt: body.occurredAt, dirty: body.dirty })
    if (signedOut()) return route.continue()
    const diaper = diaperFrom(body)
    played.today = { ...played.today, recent: [{ kind: "diaper", diaper }] }
    return route.fulfill({ status: 201, json: { diaper, changed: [["today"]] } })
  })
  return sent
}

test("keeps a diaper logged after the sign-in expired, and saves it once on the way back (§6)", async ({
  page,
  context,
  baseURL,
}) => {
  const { played } = await playHousehold(page, todayWith())
  let signedOut = true
  const sent = await recordDiapers(page, played, () => signedOut)
  await openToday(page)
  await context.addCookies([{ name: SIGNED_OUT_COOKIE, value: "1", url: baseURL ?? "" }])
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Diaper" }).click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Your sign-in has expired")
  signedOut = false
  await sheet.getByRole("link", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/")
  await expect(page.getByRole("list", { name: "Last 24 hours" })).toContainText("Pee")
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
})

test("asks before saving a draft that waited past 12 hours, then saves it under a new actionId", async ({ page }) => {
  const draft = {
    route: "/",
    sending: {
      sheet: "diaper",
      action: {
        kind: "logDiaper",
        payload: { actionId: OLD_ACTION_ID, occurredAt: NOW - 13 * HOUR, wet: false, dirty: true },
      },
    },
    createdAt: NOW - 13 * HOUR,
  }
  await page.addInitScript((stored) => sessionStorage.setItem("bt.draft", stored), JSON.stringify(draft))
  const { played } = await playHousehold(page, todayWith())
  const sent = await recordDiapers(page, played, () => false)
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await expect(sheet.getByRole("alert")).toHaveText(
    /^This wasn't saved before you signed in, Thu 8:30\sPM\. Save it now\?Save now$/u,
  )
  expect(sent).toEqual([])
  await sheet.getByRole("button", { name: "Save now" }).click()
  await expect.poll(() => sent).toHaveLength(1)
  expect(sent[0]?.actionId).not.toBe(OLD_ACTION_ID)
  expect(sent[0]).toMatchObject({ occurredAt: NOW - 13 * HOUR, dirty: true })
})

test("says so when the phone can't keep the entry through signing in, and signs in anyway when asked", async ({
  page,
  context,
  baseURL,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
    }
  })
  const { played } = await playHousehold(page, todayWith())
  let signedOut = true
  const sent = await recordDiapers(page, played, () => signedOut)
  const signIns: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/login") signIns.push(request.url())
  })
  await openToday(page)
  await context.addCookies([{ name: SIGNED_OUT_COOKIE, value: "1", url: baseURL ?? "" }])
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Diaper" }).click()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Your sign-in has expired")
  await sheet.getByRole("link", { name: "Sign in", exact: true }).click()
  await expect(sheet.getByRole("alert")).toHaveText(
    /^This phone can't keep the entry while you sign in\. Sign in, then log it again\.Sign in anyway$/u,
  )
  expect(signIns).toEqual([])
  signedOut = false
  await sheet.getByRole("link", { name: "Sign in anyway" }).click()
  await expect.poll(() => signIns).toHaveLength(1)
  await expect(sheet).toBeHidden()
  await expect(page.getByText("Nothing logged in the last 24 hours.")).toBeVisible()
  expect(sent).toHaveLength(1)
})

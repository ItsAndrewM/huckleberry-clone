import { expect, test } from "@playwright/test"
import { caregiversOf, loseSaves, playHousehold, quickAction, savedDiaper, todayWith } from "./played-household.ts"

test.use({ timezoneId: "Europe/London" })

const SECOND_ONE_TEN = Date.UTC(2025, 10, 2, 9, 10)
const FIRST_ONE_THIRTY = Date.UTC(2025, 10, 2, 8, 30)

test("takes a time from the hour the household's clocks went back over, asking which one", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith())
  const sent = await loseSaves(page, "**/api/diapers", {
    lost: 0,
    until: Promise.resolve(),
    answer: savedDiaper(andrew.id),
  })
  await page.clock.setFixedTime(SECOND_ONE_TEN)
  await page.goto("/")
  await page.getByText("Totals").waitFor()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Change" }).click()
  const when = sheet.getByLabel("When")
  await when.fill("2025-11-02T01:30")
  await expect(when).toHaveJSProperty("validationMessage", "")
  await sheet.getByRole("button", { name: /^1:30\sAM \(first\)$/u }).click()
  await sheet.getByRole("button", { name: "Pee" }).click()
  await expect.poll(() => sent.map(({ occurredAt }) => occurredAt)).toEqual([FIRST_ONE_THIRTY])
})

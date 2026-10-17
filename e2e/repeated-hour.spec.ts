import { caregiversOf, loseSaves, playHousehold, quickAction, savedDiaper, todayWith } from "./played-household.ts"
import { expect, test } from "./test.ts"
import { beforeAnyMessage, expectToldPolitely } from "./told-politely.ts"

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

test("says which one politely as the choice appears, describing the time it's about, which isn't invalid", async ({
  page,
}) => {
  await playHousehold(page, todayWith())
  await page.clock.setFixedTime(SECOND_ONE_TEN)
  await page.goto("/")
  await page.getByText("Totals").waitFor()
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await sheet.getByRole("button", { name: "Change" }).click()
  const when = sheet.getByLabel("When", { exact: true })
  await beforeAnyMessage(sheet, [when])
  await when.fill("2025-11-02T01:30")
  const question = /The clocks went back, so 1:30\sAM happened twice\. Which one\?/u
  await expectToldPolitely(sheet, question, { about: [when], invalid: false })
  await expect(sheet.getByRole("group", { name: question })).toBeVisible()
  await expect(sheet.getByText(question)).toHaveCount(1)
})

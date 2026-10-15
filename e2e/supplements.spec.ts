import { devices, type Locator, type Page } from "@playwright/test"
import {
  caregiversOf,
  type DoseAnswer,
  loseSaves,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  type Sent,
  todayWith,
} from "./played-household.ts"
import { sheetTitlesSeen, watchSheetTitles } from "./sheet-titles.ts"
import { expect, test } from "./test.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)

const tapper = () => {
  let taps = 0
  const tap = async (target: Locator) => {
    taps += 1
    await target.click()
  }
  return { tap, taps: () => taps }
}

const supplements = (page: Page) => page.getByRole("list", { name: "Supplements" })

const rowOf = (page: Page, name: string) => supplements(page).getByRole("button", { name: new RegExp(`^${name}`, "u") })

const doseSheet = (page: Page, name: string) => page.getByRole("dialog", { name })

interface Supplement {
  readonly id: string
  readonly name: string
}

const doseAt = (supplementId: string, occurredAt: number, by: string, id: string): DoseAnswer => ({
  id,
  supplementId,
  occurredAt,
  localDate: "2026-10-09",
  dose: "400 IU",
  version: 1,
  createdBy: by,
  createdAt: occurredAt,
  updatedBy: by,
  updatedAt: occurredAt,
  deletedAt: null,
})

const playDoses = async (page: Page, already: (vitaminD: string, emily: string) => DoseAnswer[] = () => []) => {
  const { andrew, emily, me } = await caregiversOf(page)
  const vitaminD: Supplement = me.household.supplements.find(({ name }: Supplement) => name === "Vitamin D")
  const doses = already(vitaminD.id, emily.id)
  const household = await playHousehold(page, { ...todayWith(), doses })
  await household.answer("**/api/doses", ({ body }: Sent) => {
    const { today } = household.played
    const sameDay = today.doses.filter(({ supplementId }) => supplementId === body.supplementId)
    const current = sameDay.at(-1)
    if (body.confirmedDuplicate !== true && current !== undefined) {
      return { status: 409, json: { _tag: "Conflict", code: "SUPPLEMENT_DUPLICATE_DAY", current } }
    }
    const dose = doseAt(body.supplementId ?? "", body.occurredAt ?? NOW, andrew.id, `dose-${today.doses.length + 1}`)
    household.played.today = { ...today, doses: [...today.doses, dose], recent: [{ kind: "dose", dose }] }
    return { status: 201, json: { dose, changed: [["today"], ["last24h"]] } }
  })
  return { played: household.played, vitaminD }
}

test.describe("Today's supplements, with the household's answers played by the test", () => {
  test.use({ timezoneId: "Europe/London" })

  test("logs today's Vitamin D in two taps from its row, and says who logged it and when (AC 2)", async ({ page }) => {
    const { played, vitaminD } = await playDoses(page)
    await openToday(page)
    await expect(rowOf(page, "Vitamin D")).toHaveText(/Vitamin D not logged yet today\s*400 IU/u)
    const { tap, taps } = tapper()
    await tap(rowOf(page, "Vitamin D"))
    await tap(doseSheet(page, "Vitamin D").getByRole("button", { name: "Log Vitamin D" }))
    expect(taps()).toBe(2)
    await expect
      .poll(() => played.sent)
      .toEqual([
        {
          method: "POST",
          path: "/api/doses",
          body: { actionId: ACTION_ID, supplementId: vitaminD.id, occurredAt: NOW, confirmedDuplicate: false },
        },
      ])
    await expect(rowOf(page, "Vitamin D")).toHaveText(/Vitamin D logged at 9:30\sAM\s*by Andrew \(local\)/u)
    await expect(page.getByRole("list", { name: "Last 24 hours" })).toContainText("Vitamin D")
    await expect(page.getByRole("status").filter({ hasText: "Dose saved" })).toBeVisible()
  })

  test("asks before a second dose that day, and records it once the parent means it", async ({ page }) => {
    const { played } = await playDoses(page, (vitaminD, emily) => [
      doseAt(vitaminD, NOW - 200 * MINUTE, emily, "dose-0"),
    ])
    await openToday(page)
    await expect(rowOf(page, "Vitamin D")).toHaveText(/Vitamin D logged at 6:10\sAM\s*by Emily \(local\)/u)
    await rowOf(page, "Vitamin D").click()
    const sheet = doseSheet(page, "Vitamin D")
    await sheet.getByRole("button", { name: "Log Vitamin D" }).click()
    await expect(sheet.getByRole("alert")).toHaveText(
      /Vitamin D was logged at 6:10\sAM by Emily \(local\)\. Record another dose anyway\?/u,
    )
    await expect(sheet.getByText("One tap saves it.")).toHaveCount(0)
    await sheet.getByRole("button", { name: "Record another dose" }).click()
    await expect
      .poll(() => played.sent.map(({ body }) => [body.actionId, body.confirmedDuplicate]))
      .toEqual([
        [ACTION_ID, false],
        [ACTION_ID, true],
      ])
    expect(new Set(played.sent.map(({ body }) => body.actionId)).size).toBe(2)
    await expect(rowOf(page, "Vitamin D")).toHaveText(/Vitamin D logged twice today, last at 9:30\sAM/u)
  })

  test("logs nothing more when the parent doesn't mean a second dose", async ({ page }) => {
    const { played } = await playDoses(page, (vitaminD, emily) => [
      doseAt(vitaminD, NOW - 200 * MINUTE, emily, "dose-0"),
    ])
    await openToday(page)
    await rowOf(page, "Vitamin D").click()
    const sheet = doseSheet(page, "Vitamin D")
    await sheet.getByRole("button", { name: "Log Vitamin D" }).click()
    await sheet.getByRole("button", { name: "Don't record it" }).click()
    await expect(sheet).toBeHidden()
    expect(played.sent).toHaveLength(1)
    await expect(rowOf(page, "Vitamin D")).toHaveText(/Vitamin D logged at 6:10\sAM/u)
  })

  test("keeps a dose that failed with no connection through a reload, and asks before saving it under its actionId", async ({
    page,
  }) => {
    const { andrew, me } = await caregiversOf(page)
    const vitaminD: Supplement = me.household.supplements.find(({ name }: Supplement) => name === "Vitamin D")
    await playHousehold(page, todayWith())
    const sent = await loseSaves(page, "**/api/doses", {
      lost: 1,
      until: Promise.resolve(),
      answer: ({ occurredAt }) => ({ dose: doseAt(vitaminD.id, occurredAt ?? NOW, andrew.id, "dose-1"), changed: [] }),
    })
    await openToday(page)
    await rowOf(page, "Vitamin D").click()
    const sheet = doseSheet(page, "Vitamin D")
    await sheet.getByRole("button", { name: "Log Vitamin D" }).click()
    await expect(sheet.getByRole("alert")).toContainText("No connection. This is kept on this phone:")
    await page.reload()
    await expect(sheet.getByRole("alert")).toHaveText(/^This wasn't saved, Fri 9:30\sAM\. Save it now\?Save now$/u)
    await sheet.getByRole("button", { name: "Save now" }).click()
    await expect(page.getByText("Dose saved")).toBeVisible()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
  })

  test("keeps the dose sheet on its supplement while it slides away after a log", async ({ page }) => {
    await playDoses(page)
    await openToday(page)
    await rowOf(page, "Vitamin D").click()
    const log = doseSheet(page, "Vitamin D").getByRole("button", { name: "Log Vitamin D" })
    await expect(log).toBeVisible()
    await watchSheetTitles(page)
    await log.click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(await sheetTitlesSeen(page)).toEqual(["Vitamin D"])
  })

  test("logs a dose at the time picked, read on the household's clock", async ({ page }) => {
    const { played } = await playDoses(page)
    await openToday(page)
    await rowOf(page, "Vitamin D").click()
    const sheet = doseSheet(page, "Vitamin D")
    await sheet.getByRole("button", { name: "Change" }).click()
    await sheet.getByLabel("When").fill("2026-10-09T08:50")
    await sheet.getByRole("button", { name: "Log Vitamin D" }).click()
    await expect.poll(() => played.sent.map(({ body }) => body.occurredAt)).toEqual([NOW - 40 * MINUTE])
  })
})

test("shows a dose logged on one phone on the other within 2 seconds (AC 6)", async ({ browser, page }, testInfo) => {
  const name = `Test drops ${crypto.randomUUID().slice(0, 8)}`
  const added = await page.request.post("/api/supplements", {
    data: { actionId: crypto.randomUUID(), name, dose: "1 mL" },
  })
  expect(added.status()).toBe(201)
  const { supplement } = await added.json()
  const baseURL = testInfo.project.use.baseURL ?? ""
  const other = await browser.newContext({
    ...devices["iPhone 15"],
    baseURL,
    serviceWorkers: "block",
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: "bt.install-card", value: "dismissed" }] }],
    },
  })
  try {
    const watching = await other.newPage()
    await watching.goto("/")
    await expect(rowOf(watching, name)).toHaveText(new RegExp(`${name} not logged yet today`, "u"))
    await page.goto("/")
    await rowOf(page, name).click()
    await doseSheet(page, name)
      .getByRole("button", { name: `Log ${name}` })
      .click()
    await expect(rowOf(page, name)).toHaveText(new RegExp(`${name} logged at`, "u"))
    await expect(rowOf(watching, name)).toHaveText(new RegExp(`${name} logged at`, "u"), { timeout: 2_000 })
  } finally {
    await other.close()
    await page.request.patch(`/api/supplements/${supplement.id}`, {
      data: { actionId: crypto.randomUUID(), version: 1, name, dose: "1 mL", stopped: true },
    })
  }
})

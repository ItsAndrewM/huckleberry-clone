import type { Locator, Page, Route } from "@playwright/test"
import {
  caregiversOf,
  type DoseAnswer,
  gate,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  type Sent,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

const supplements = (page: Page) => page.getByRole("list", { name: "Supplements" })

const rowOf = (page: Page, name: string) => supplements(page).getByRole("button", { name: new RegExp(`^${name}`, "u") })

const doseSheet = (page: Page, name: string) => page.getByRole("dialog", { name })

interface Supplement {
  readonly id: string
  readonly name: string
}

const doseAt = (supplementId: string, occurredAt: number, by: string, id: string, dose = "400 IU"): DoseAnswer => ({
  id,
  supplementId,
  occurredAt,
  localDate: "2026-10-09",
  dose,
  version: 1,
  createdBy: by,
  createdAt: occurredAt,
  updatedBy: by,
  updatedAt: occurredAt,
  deletedAt: null,
})

const supplementOf = (id: string, name: string, dose: string) => ({
  id,
  name,
  dose,
  stoppedAt: null,
  version: 1,
  createdBy: null,
  createdAt: NOW,
  updatedBy: null,
  updatedAt: NOW,
})

const boxOf = async (target: Locator) => {
  const box = await target.boundingBox()
  if (box === null) throw new Error(`${target} isn't on screen to measure`)
  return box
}

const textEndOf = (target: Locator) =>
  target.evaluate((element) => {
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    return range.getBoundingClientRect().right
  })

const scrollsSideways = (sheet: Locator) =>
  sheet.evaluate((dialog) => {
    const view = dialog.ownerDocument.defaultView
    return [dialog, ...dialog.querySelectorAll("*")].some((element) => {
      const overflowX = view?.getComputedStyle(element).overflowX
      return (overflowX === "auto" || overflowX === "scroll") && element.scrollWidth > element.clientWidth
    })
  })

const endsBefore = async (text: Locator, next: Locator) => {
  expect(await textEndOf(text)).toBeLessThanOrEqual((await boxOf(next)).x)
}

const playWith = async (page: Page, added: ReadonlyArray<ReturnType<typeof supplementOf>>) => {
  const { andrew, emily, me } = await caregiversOf(page)
  const household = { ...me.household, supplements: [...me.household.supplements, ...added] }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household } }))
  const vitaminD: Supplement = me.household.supplements.find(({ name }: Supplement) => name === "Vitamin D")
  return { andrew, emily, vitaminD }
}

const LONGEST = [
  supplementOf("supplement-long", "Long dose", "2 drops (0.1 mL) once daily with a feed!"),
  supplementOf("supplement-wide", "Wide dose", "W".repeat(40)),
  supplementOf("supplement-unbroken", "Multivitamin".repeat(5), "5 mL"),
]

const playLongest = async (page: Page, logged: boolean) => {
  await page.setViewportSize({ width: 360, height: 900 })
  const { emily } = await playWith(page, LONGEST)
  const doses = logged
    ? LONGEST.map(({ id, dose }, index) => doseAt(id, NOW - (index + 1) * 20 * MINUTE, emily.id, `dose-${index}`, dose))
    : []
  await playHousehold(page, { ...todayWith(), doses, recent: doses.map((dose) => ({ kind: "dose" as const, dose })) })
  await openToday(page)
}

test.describe("The longest doses and names, on a 360-pixel-wide phone", () => {
  test("wrap inside Today's card, clear of its chevron, before they're logged", async ({ page }) => {
    await playLongest(page, false)
    for (const { name, dose } of LONGEST) {
      const row = rowOf(page, name)
      const chevron = row.locator("svg").last()
      await endsBefore(row.getByText(name), chevron)
      await endsBefore(row.getByText(dose), chevron)
    }
  })

  test("keep the dose sheet's title and Log button inside the sheet, without scrolling it or the page sideways", async ({
    page,
  }) => {
    await playLongest(page, false)
    const name = "Multivitamin".repeat(5)
    expect(name).toHaveLength(60)
    await rowOf(page, name).click()
    const sheet = doseSheet(page, name)
    const title = sheet.getByRole("heading", { name })
    const log = sheet.getByRole("button", { name: `Log ${name}` })
    await expect(log).toBeVisible()
    const edge = await boxOf(sheet)
    const right = edge.x + edge.width
    expect(await textEndOf(title)).toBeLessThanOrEqual(right)
    expect(await textEndOf(log)).toBeLessThanOrEqual((await boxOf(log)).x + (await boxOf(log)).width)
    expect((await boxOf(log)).x + (await boxOf(log)).width).toBeLessThanOrEqual(right)
    expect((await boxOf(log)).height).toBeGreaterThanOrEqual(44)
    expect(await scrollsSideways(sheet)).toBe(false)
    expect(await page.locator("html").evaluate((root) => root.scrollWidth - root.clientWidth)).toBe(0)
  })

  test("wrap inside Today's card and its Last 24 hours rows once they're logged", async ({ page }) => {
    await playLongest(page, true)
    for (const { name, dose } of LONGEST) {
      const row = rowOf(page, name)
      const chevron = row.locator("svg").last()
      await endsBefore(row.getByText(name), chevron)
      await endsBefore(row.getByText(dose), chevron)
      const item = page.getByRole("list", { name: "Last 24 hours" }).getByRole("listitem").filter({ hasText: name })
      const time = item.locator("time").locator("xpath=..")
      await endsBefore(item.getByText(name), time)
      await endsBefore(item.getByText(dose), time)
    }
  })
})

const IRON = supplementOf("supplement-iron", "Iron", "1 mL")

const LATE_FAILURES = [
  {
    title: "with no connection",
    fails: (route: Route) => route.abort("internetdisconnected"),
    says: /No connection\. This is kept on this phone:/u,
  },
  {
    title: "as a second dose that day",
    fails: (route: Route, current: DoseAnswer) =>
      route.fulfill({ status: 409, json: { _tag: "Conflict", code: "SUPPLEMENT_DUPLICATE_DAY", current } }),
    says: /Vitamin D was logged at 6:10\sAM by Emily \(local\)\. Record another dose anyway\?/u,
  },
]

for (const { title, fails, says } of LATE_FAILURES) {
  test(`keeps the sheet a parent is on when another supplement's dose fails late ${title}, and opens that dose's own sheet next`, async ({
    page,
  }) => {
    const { andrew, emily, vitaminD } = await playWith(page, [IRON])
    const earlier = doseAt(vitaminD.id, NOW - 200 * MINUTE, emily.id, "dose-0")
    await playHousehold(page, todayWith())
    const slow = gate()
    const sent: Array<Sent["body"]> = []
    await page.route("**/api/doses", async (route) => {
      const body: Sent["body"] = route.request().postDataJSON()
      sent.push(body)
      if (sent.length === 1) {
        await slow.opened
        return fails(route, earlier)
      }
      const dose = doseAt(body.supplementId ?? "", body.occurredAt ?? NOW, andrew.id, "dose-1")
      return route.fulfill({ status: 201, json: { dose, changed: [] } })
    })
    await openToday(page)
    await rowOf(page, "Vitamin D").click()
    await doseSheet(page, "Vitamin D").getByRole("button", { name: "Log Vitamin D" }).click()
    await rowOf(page, "Iron").click()
    const iron = doseSheet(page, "Iron")
    await expect(iron.getByRole("button", { name: "Log Iron" })).toBeVisible()
    slow.open()
    await expect(page.getByText("Vitamin D not logged yet today")).toBeVisible()
    await expect(iron.getByRole("button", { name: "Log Iron" })).toBeVisible()
    await expect(iron.getByRole("alert")).toHaveCount(0)
    await iron.getByRole("button", { name: "Log Iron" }).click()
    await expect(doseSheet(page, "Vitamin D").getByRole("alert")).toHaveText(says)
    expect(sent.map(({ supplementId }) => supplementId)).toEqual([vitaminD.id, IRON.id])
  })
}

test("sends a second dose as it was asked for when the form is tapped after the connection dropped", async ({
  page,
}) => {
  const { andrew, emily, vitaminD } = await playWith(page, [])
  const earlier = doseAt(vitaminD.id, NOW - 200 * MINUTE, emily.id, "dose-0")
  await playHousehold(page, { ...todayWith(), doses: [earlier] })
  const sent: Array<Sent["body"]> = []
  await page.route("**/api/doses", async (route) => {
    const body: Sent["body"] = route.request().postDataJSON()
    sent.push(body)
    if (sent.length === 1) {
      const json = { _tag: "Conflict", code: "SUPPLEMENT_DUPLICATE_DAY", current: earlier }
      return route.fulfill({ status: 409, json })
    }
    if (sent.length === 2) return route.abort("internetdisconnected")
    const dose = doseAt(vitaminD.id, body.occurredAt ?? NOW, andrew.id, "dose-1")
    return route.fulfill({ status: 201, json: { dose, changed: [] } })
  })
  await openToday(page)
  await rowOf(page, "Vitamin D").click()
  const sheet = doseSheet(page, "Vitamin D")
  await sheet.getByRole("button", { name: "Log Vitamin D" }).click()
  await expect(sheet.getByRole("alert")).toHaveText(/Record another dose anyway\?/u)
  await page.evaluate("dispatchEvent(new Event('offline'))")
  await sheet.getByRole("button", { name: "Record another dose" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection. This is kept on this phone:")
  await sheet.getByRole("button", { name: "Log Vitamin D" }).click()
  await expect(page.getByText("Dose saved")).toBeVisible()
  expect(sent).toHaveLength(3)
  expect(sent[1]?.confirmedDuplicate).toBe(true)
  expect(sent[2]).toEqual(sent[1])
})

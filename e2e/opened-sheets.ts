import type { Locator, Page } from "@playwright/test"
import { diaper, local } from "./played-day.ts"
import { caregiversOf, quickAction } from "./played-household.ts"
import { expect } from "./test.ts"

export interface OpenedSheet {
  readonly name: string
  readonly dialog: string | RegExp
  readonly path: string
  readonly ready: (page: Page) => Locator
  readonly open: (page: Page) => Promise<void>
}

const TODAY = { path: "/", ready: (page: Page) => page.getByText("Totals") }

const HISTORY = {
  path: "/history",
  ready: (page: Page) => page.getByRole("region", { name: "The day by hour" }),
}

const GROWTH = { path: "/growth", ready: (page: Page) => page.getByRole("region", { name: "Measurements" }) }

const recentRow = (page: Page, kind: string) =>
  page.getByRole("list", { name: "Last 24 hours" }).getByRole("button").filter({ hasText: kind }).first()

const hourRow = (page: Page) =>
  page
    .getByRole("region", { name: "The day by hour" })
    .getByRole("button", { name: /^Log at 6/u })
    .first()

const entryButton = (page: Page) =>
  page
    .getByRole("region", { name: "The day by hour" })
    .getByRole("button", { name: /^Diaper/u })
    .first()

const pastSleep = async (page: Page) => {
  await quickAction(page, "Sleep").click()
  await page.getByRole("dialog", { name: "Sleep" }).getByRole("button", { name: "Log a past sleep" }).click()
}

const pastFeed = async (page: Page) => {
  await hourRow(page).click()
  await page
    .getByRole("dialog", { name: /^Log at / })
    .getByRole("button", { name: "Nursing" })
    .click()
}

const staleDiaper = async (page: Page) => {
  const { emily } = await caregiversOf(page)
  const theirs = { ...diaper("both", local("05:30"), false, true, emily.id), version: 2 }
  await page.route("**/api/diapers/both", (route) =>
    route.fulfill({ status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } }),
  )
  await recentRow(page, "Pee and poo").click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Pee", exact: true }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText("changed this a moment ago.")
}

export const OPENED_SHEETS: ReadonlyArray<OpenedSheet> = [
  { name: "Bottle", dialog: "Bottle", ...TODAY, open: (page) => quickAction(page, "Bottle").click() },
  { name: "Nursing", dialog: "Nursing", ...TODAY, open: (page) => quickAction(page, "Nursing").click() },
  { name: "Diaper", dialog: "Diaper", ...TODAY, open: (page) => quickAction(page, "Diaper").click() },
  { name: "Sleep", dialog: "Sleep", ...TODAY, open: (page) => quickAction(page, "Sleep").click() },
  { name: "Past feed", dialog: "Past feed", ...HISTORY, open: pastFeed },
  { name: "Past sleep", dialog: "Past sleep", ...TODAY, open: pastSleep },
  { name: "Edit diaper", dialog: "Edit diaper", ...TODAY, open: (page) => recentRow(page, "Pee and poo").click() },
  { name: "Edit feed", dialog: "Edit feed", ...TODAY, open: (page) => recentRow(page, "Nursing and bottle").click() },
  { name: "Edit sleep", dialog: "Edit sleep", ...TODAY, open: (page) => recentRow(page, "Nap").click() },
  { name: "Edit dose", dialog: "Edit dose", ...TODAY, open: (page) => recentRow(page, "Vitamin D").click() },
  { name: "Edit diaper's stale note", dialog: "Edit diaper", ...TODAY, open: staleDiaper },
  { name: "History's details", dialog: "Diaper", ...HISTORY, open: (page) => entryButton(page).click() },
  { name: "History's Log at", dialog: /^Log at /u, ...HISTORY, open: (page) => hourRow(page).click() },
  {
    name: "Add measurement",
    dialog: "Add measurement",
    ...GROWTH,
    open: (page) => page.getByRole("button", { name: "Add measurement" }).first().click(),
  },
  {
    name: "Edit measurement",
    dialog: "Edit measurement",
    ...GROWTH,
    open: (page) =>
      page
        .getByRole("button", { name: /^Edit the measurement from/u })
        .first()
        .click(),
  },
]

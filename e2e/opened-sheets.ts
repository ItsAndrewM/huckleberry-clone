import type { Locator, Page } from "@playwright/test"
import { quickAction } from "./played-household.ts"

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

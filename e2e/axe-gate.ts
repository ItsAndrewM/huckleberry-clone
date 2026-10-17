import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import type { OpenedSheet } from "./opened-sheets.ts"
import { STILL } from "./still.ts"
import { expect } from "./test.ts"

const WCAG_A_AND_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]
const BASE_UI_FOCUS_GUARDS = "[data-base-ui-focus-guard]"
const NO_SHEET_BLEED = '[data-slot="drawer-popup"]::after { display: none !important; }'

export type Opening = Pick<OpenedSheet, "dialog" | "open">

const violationsOn = async (page: Page) => {
  await page.addStyleTag({ content: `${STILL} ${NO_SHEET_BLEED}` })
  expect(await page.evaluate("document.getAnimations().length")).toBe(0)
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AND_AA).exclude(BASE_UI_FOCUS_GUARDS).analyze()
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map(({ target }) => target.join(" ")).join(" | ")}`)
}

export const expectNoViolations = async (page: Page) => {
  expect(await violationsOn(page)).toEqual([])
}

export const openSheet = async (page: Page, { dialog, open }: Opening) => {
  await open(page)
  await expect(page.getByRole("dialog")).toHaveCount(1)
  await expect(page.getByRole("dialog", { name: dialog })).toBeVisible()
}

const closeSheet = async (page: Page) => {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

export const expectNoViolationsIn = async (page: Page, opening: Opening) => {
  await openSheet(page, opening)
  await expectNoViolations(page)
  await closeSheet(page)
}

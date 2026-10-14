import type { Checked } from "../service-worker/updates.ts"
import type { Sheets } from "../sheets/sheets-context.ts"

type SheetsNow = Pick<Sheets, "open" | "held" | "toast">

interface PageNow {
  readonly querySelector: (selectors: string) => Pick<Element, "matches"> | null
  readonly activeElement: Pick<Element, "matches"> | null
}

const OPEN_DIALOG = '[role="dialog"], [role="alertdialog"]'
const UNSAVED_FORM = "[data-unsaved]"
const TYPING = 'input, textarea, select, [contenteditable="true"]'

const nothingPending = (sheets: SheetsNow, saving: number) =>
  sheets.open === null && sheets.held.length === 0 && sheets.toast === null && saving === 0

const nothingOnScreen = (page: PageNow) =>
  page.querySelector(OPEN_DIALOG) === null &&
  page.querySelector(UNSAVED_FORM) === null &&
  !(page.activeElement?.matches(TYPING) ?? false)

export const isIdle = (sheets: SheetsNow, page: PageNow, saving: number) =>
  nothingPending(sheets, saving) && nothingOnScreen(page)

export interface Return {
  readonly idle: () => boolean
  readonly online: () => boolean
  readonly newerSaved: () => Promise<boolean>
  readonly reload: () => void
  readonly check: () => Promise<Checked>
}

export type Returned = "reloaded" | "waiting" | Checked

export const returnToApp = async ({ idle, online, newerSaved, reload, check }: Return): Promise<Returned> => {
  if (!idle() || !online()) return check()
  const checked = await check()
  if (checked === "unavailable" || !(await newerSaved())) return checked
  if (!idle() || !online()) return "waiting"
  reload()
  return "reloaded"
}

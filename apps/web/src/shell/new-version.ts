import type { Checked } from "../service-worker/updates.ts"
import type { Sheets } from "../sheets/sheets-context.ts"

type SheetsNow = Pick<Sheets, "open" | "busy" | "held" | "toast">

interface PageNow {
  readonly querySelector: (selectors: string) => Pick<Element, "matches"> | null
  readonly activeElement: Pick<Element, "matches"> | null
}

const OPEN_DIALOG = '[role="dialog"], [role="alertdialog"]'
const TYPING = 'input, textarea, select, [contenteditable="true"]'

export const isIdle = (sheets: SheetsNow, page: PageNow) =>
  sheets.open === null &&
  sheets.busy === null &&
  sheets.held.length === 0 &&
  sheets.toast === null &&
  page.querySelector(OPEN_DIALOG) === null &&
  !(page.activeElement?.matches(TYPING) ?? false)

export interface Return {
  readonly idle: () => boolean
  readonly newerSaved: () => Promise<boolean>
  readonly reload: () => void
  readonly check: () => Promise<Checked>
}

export type Returned = "reloaded" | "waiting" | Checked

export const returnToApp = async ({ idle, newerSaved, reload, check }: Return): Promise<Returned> => {
  if (!idle()) return check()
  if (!(await newerSaved())) return check()
  if (!idle()) return "waiting"
  reload()
  return "reloaded"
}

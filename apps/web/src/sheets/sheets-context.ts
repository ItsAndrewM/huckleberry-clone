import { createContext, use } from "react"
import type { Failed, Sending, SheetKind } from "./sending.ts"
import type { Toast } from "./undo.ts"

export interface Sheets {
  readonly open: SheetKind | null
  readonly failed: Failed | null
  readonly busy: Sending | null
  readonly toast: Toast | null
  readonly show: (sheet: SheetKind) => void
  readonly close: () => void
  readonly send: (sending: Sending) => void
}

export const SheetsContext = createContext<Sheets | null>(null)

export const useSheets = () => {
  const sheets = use(SheetsContext)
  if (sheets === null) throw new Error("useSheets runs inside <SheetsProvider>")
  return sheets
}

export const failedFor = (sheets: Sheets, sheet: SheetKind) =>
  sheets.failed?.sending.sheet === sheet ? sheets.failed : null

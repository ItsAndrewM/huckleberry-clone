import { createContext, use } from "react"
import { heldFor } from "./held.ts"
import type { Failed, Sending, SheetKind } from "./sending.ts"
import type { Pending } from "./sheets-state.ts"
import type { Toast } from "./undo.ts"

export type TimedSheet = "bottle" | "pastFeed" | "diaper" | "measurement" | "pastSleep" | "dose" | "logAt"

export interface Sheets {
  readonly open: SheetKind | null
  readonly editing: string | null
  readonly at: number | null
  readonly opened: number
  readonly held: ReadonlyArray<Failed>
  readonly asking: boolean
  readonly pending: Pending | null
  readonly busy: Sending | null
  readonly toast: Toast | null
  readonly queued: boolean
  readonly keeping: boolean
  readonly show: (sheet: SheetKind, editing?: string) => void
  readonly showAt: (sheet: TimedSheet, at: number, editing?: string) => void
  readonly close: () => void
  readonly dismiss: (sheet: SheetKind) => void
  readonly keep: () => void
  readonly discard: (failed: Failed) => void
  readonly send: (sending: Sending) => void
  readonly announce: (toast: Toast) => void
}

export const SheetsContext = createContext<Sheets | null>(null)

export const useSheets = () => {
  const sheets = use(SheetsContext)
  if (sheets === null) throw new Error("useSheets runs inside <SheetsProvider>")
  return sheets
}

export const failedFor = (sheets: Sheets, sheet: SheetKind) => heldFor(sheets.held, sheet, sheets.editing)

export const busyRecord = ({ busy }: Sheets) => (busy !== null && "id" in busy.action ? busy.action.id : null)

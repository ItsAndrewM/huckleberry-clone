import type { RecentEntry } from "@bt/contracts"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import type { Display } from "../today/display.ts"
import { StaleNote } from "./stale-note.tsx"
import { staleOf } from "./stale.ts"

interface EditFailureProps {
  readonly sheet: "editDiaper" | "editFeed" | "editDose"
  readonly display: Display
  readonly onUseTheirs: (current: RecentEntry) => void
}

export const EditFailure = ({ sheet, display, onUseTheirs }: EditFailureProps) => {
  const sheets = useSheets()
  const failed = failedFor(sheets, sheet)
  const stale = failed === null ? null : staleOf(failed)
  if (failed === null || stale === null) return <FailureNote sheet={sheet} />
  return <StaleNote failed={failed} stale={stale} display={display} onUseTheirs={onUseTheirs} />
}

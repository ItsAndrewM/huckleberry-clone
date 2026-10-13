import type { DayPeriod, Me } from "@bt/contracts"
import { useState } from "react"
import { useSheets } from "../../sheets/sheets-context.ts"
import { displayOf } from "../today/display.ts"
import { DayGrid } from "./day-grid.tsx"
import { dayModel, entriesIn, isLiveFeed } from "./day-model.ts"
import { DayTotals } from "./day-totals.tsx"
import { DetailsSheet } from "./details-sheet.tsx"
import type { Hidden } from "./history-kinds.ts"
import { LogAtSheet } from "./log-at-sheet.tsx"

interface DayViewProps {
  readonly day: DayPeriod
  readonly me: Me
  readonly now: number
  readonly hidden: Hidden
}

export const DayView = ({ day, me, now, hidden }: DayViewProps) => {
  const sheets = useSheets()
  const [shown, setShown] = useState<ReadonlyArray<string> | null>(null)
  const display = displayOf(me.household)
  const model = dayModel(day, display.timeZone, now, hidden)
  const open = (ids: ReadonlyArray<string>) => {
    if (isLiveFeed(entriesIn(model, ids))) {
      sheets.show("nursing")
      return
    }
    setShown(ids)
    sheets.show("details")
  }
  const detailsLeftFromAnotherDay = shown === null && sheets.open === "details"
  return (
    <>
      <DayTotals day={day} me={me} hidden={hidden} />
      <DayGrid model={model} display={display} now={now} onOpen={open} />
      {detailsLeftFromAnotherDay ? null : (
        <DetailsSheet entries={entriesIn(model, shown ?? [])} display={display} now={now} />
      )}
      <LogAtSheet zone={display.timeZone} />
    </>
  )
}

import type { DayPeriod, Me } from "@bt/contracts"
import { useState } from "react"
import { useSheets } from "../../sheets/sheets-context.ts"
import { displayOf } from "../today/display.ts"
import { DayGrid } from "./day-grid.tsx"
import { dayModel, entriesIn, isLiveFeed } from "./day-model.ts"
import { DayTotals } from "./day-totals.tsx"
import { DetailsSheet } from "./details-sheet.tsx"

interface DayViewProps {
  readonly day: DayPeriod
  readonly me: Me
  readonly now: number
}

export const DayView = ({ day, me, now }: DayViewProps) => {
  const sheets = useSheets()
  const [shown, setShown] = useState<ReadonlyArray<string>>([])
  const display = displayOf(me.household)
  const model = dayModel(day, display.timeZone, now)
  const open = (ids: ReadonlyArray<string>) => {
    if (isLiveFeed(entriesIn(model, ids))) {
      sheets.show("nursing")
      return
    }
    setShown(ids)
    sheets.show("details")
  }
  return (
    <>
      <DayTotals day={day} me={me} />
      <DayGrid model={model} display={display} now={now} onOpen={open} />
      <DetailsSheet entries={entriesIn(model, shown)} display={display} now={now} />
    </>
  )
}

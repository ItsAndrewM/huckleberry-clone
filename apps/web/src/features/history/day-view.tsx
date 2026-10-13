import type { DayPeriod, Me } from "@bt/contracts"
import { useState } from "react"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { displayOf } from "../today/display.ts"
import { DayGrid } from "./day-grid.tsx"
import { DayList } from "./day-list.tsx"
import { dayModel, entriesIn, isLiveFeed } from "./day-model.ts"
import { DayTotals } from "./day-totals.tsx"
import { DetailsSheet } from "./details-sheet.tsx"
import type { Hidden } from "./history-kinds.ts"
import { listNote, listRows } from "./list-rows.ts"
import { LogAtSheet } from "./log-at-sheet.tsx"
import { logTimeOn } from "./log-time.ts"

interface DayViewProps {
  readonly day: DayPeriod
  readonly me: Me
  readonly now: number
  readonly hidden: Hidden
  readonly asList: boolean
}

export const DayView = ({ day, me, now, hidden, asList }: DayViewProps) => {
  const sheets = useSheets()
  const [shown, setShown] = useState<ReadonlyArray<string> | null>(null)
  const [dismissOnLeave] = useState(() => {
    const { dismiss } = sheets
    return (node: HTMLDivElement | null) => {
      if (node === null) return undefined
      return () => {
        dismiss("details")
        dismiss("logAt")
      }
    }
  })
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
  const logOnDay = () => {
    const at = logTimeOn(day.date, display.timeZone, tapTime())
    if (at === null) sheets.show("logAt")
    else sheets.showAt("logAt", at)
  }
  const rows = asList ? listRows(day, display, now, hidden) : []
  const detailsLeftFromAnotherDay = shown === null && sheets.open === "details"
  return (
    <div ref={dismissOnLeave} className="contents">
      <DayTotals day={day} me={me} hidden={hidden} />
      {asList ? (
        <DayList rows={rows} note={listNote(day, rows)} onOpen={(id) => open([id])} onLog={logOnDay} />
      ) : (
        <DayGrid model={model} display={display} now={now} onOpen={open} />
      )}
      {detailsLeftFromAnotherDay ? null : (
        <DetailsSheet entries={entriesIn(model, shown ?? [])} display={display} now={now} />
      )}
      <LogAtSheet zone={display.timeZone} />
    </div>
  )
}

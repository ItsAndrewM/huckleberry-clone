import type { RecentEntry, Sleep } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { useNow } from "../../timer/use-now.ts"
import { EditFailure } from "../edit/edit-failure.tsx"
import type { Display } from "../today/display.ts"
import { editedSpan, editedStart, sleepDelete, sleepEdit, sleepEditSession } from "./sleep-edit.ts"
import { SleepKindToggle } from "./sleep-kind-toggle.tsx"
import { SleepTimesFields } from "./sleep-times.tsx"

interface EditSleepFormProps {
  readonly sleep: Sleep
  readonly display: Display
  readonly onUseTheirs: (current: RecentEntry) => void
}

export const EditSleepForm = ({ sleep, display, onUseTheirs }: EditSleepFormProps) => {
  const sheets = useSheets()
  const zone = display.timeZone
  const [session] = useState(() => sleepEditSession(failedFor(sheets, "editSleep"), sleep, zone))
  const [times, setTimes] = useState(session.times)
  const [kind, setKind] = useState(session.kind)
  const now = useNow()
  const span = editedSpan(session, times, zone, now)
  const start = editedStart(session, times, zone, now)
  const save = () => {
    if (sheets.open !== "editSleep") return
    const at = editedSpan(session, times, zone, tapTime())
    if (at.ok) sheets.send({ sheet: "editSleep", action: sleepEdit(session, kind, at.startedAt, at.endedAt) })
  }
  const remove = () => {
    if (sheets.open === "editSleep") sheets.send({ sheet: "editSleep", action: sleepDelete(session.target) })
  }
  return (
    <>
      <EditFailure sheet="editSleep" display={display} onUseTheirs={onUseTheirs} />
      <SleepTimesFields times={times} start={start} span={span} zone={zone} now={now} onChange={setTimes} />
      <SleepKindToggle kind={kind} onChange={setKind} />
      <Button size="lg" className="h-14 text-lg" disabled={!span.ok} onClick={save}>
        Save
      </Button>
      <DeleteEntry noun="sleep" emptied={null} onDelete={remove} />
    </>
  )
}

import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { resolveWhen } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { pastSleepEntry, pastSleepSession, type SleepTimes, spanOf } from "./past-sleep.ts"
import { SleepKindToggle } from "./sleep-kind-toggle.tsx"
import { kindShown } from "./sleep-session.ts"
import { SleepTimesFields } from "./sleep-times.tsx"

export const PastSleepForm = ({ zone }: { readonly zone: string }) => {
  const sheets = useSheets()
  const now = useNow()
  const [session] = useState(() => pastSleepSession(failedFor(sheets, "pastSleep"), now, zone, sheets.at))
  const [times, setTimes] = useState<SleepTimes>({ fellAsleep: session.fellAsleep, woke: session.woke })
  const [picked, setPicked] = useState(session.picked)
  const start = resolveWhen(times.fellAsleep, zone, now)
  const span = spanOf(times, zone, now)
  const save = () => {
    if (sheets.open !== "pastSleep") return
    const payload = pastSleepEntry(session.actionId, times, picked, zone, tapTime())
    if (payload !== null) sheets.send({ sheet: "pastSleep", action: { kind: "logSleep", payload } })
  }
  return (
    <>
      <FailureNote sheet="pastSleep" />
      <SleepTimesFields times={times} start={start} span={span} zone={zone} now={now} onChange={setTimes} />
      <SleepKindToggle kind={kindShown(picked, start, zone, now)} onChange={setPicked} />
      <Button size="lg" className="h-14 text-lg" disabled={!span.ok} onClick={save}>
        Save
      </Button>
    </>
  )
}

import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { resolveWhen } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { SleepKindToggle } from "./sleep-kind-toggle.tsx"
import { kindShown, sleepStartSession } from "./sleep-session.ts"
import { startAction } from "./sleep-state.ts"

export const StartSleepView = ({ zone }: { readonly zone: string }) => {
  const sheets = useSheets()
  const [session] = useState(() => sleepStartSession(failedFor(sheets, "sleep"), zone))
  const [when, setWhen] = useState(session.when)
  const [picked, setPicked] = useState(session.picked)
  const now = useNow()
  const start = resolveWhen(when, zone, now)
  const begin = () => {
    if (sheets.open !== "sleep") return
    const at = tapTime()
    const resolved = resolveWhen(when, zone, at)
    if (!resolved.ok) return
    const kind = kindShown(picked, resolved, zone, at)
    sheets.send({ sheet: "sleep", action: startAction(session.actionId, kind, resolved.instant) })
  }
  return (
    <>
      <WhenField label="Fell asleep" when={when} onChange={setWhen} zone={zone} now={now} />
      <SleepKindToggle kind={kindShown(picked, start, zone, now)} onChange={setPicked} />
      <Button size="lg" className="h-14 text-lg" disabled={!start.ok} onClick={begin}>
        Start sleep
      </Button>
      <FailureNote sheet="sleep" />
    </>
  )
}

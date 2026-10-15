import type { Sleep } from "@bt/contracts"
import { useState } from "react"
import type { SleepAction } from "../../api/actions.ts"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { useNow } from "../../timer/use-now.ts"
import { SleepKindToggle } from "./sleep-kind-toggle.tsx"
import { AFTER_SLEEP, wakeAt, wakeSession } from "./sleep-session.ts"
import { SleepStart } from "./sleep-start.tsx"
import { deleteAction, runningEdit, sleepWaits, wakeAction } from "./sleep-state.ts"
import { SleepTimer } from "./sleep-timer.tsx"

interface RunningSleepViewProps {
  readonly sleep: Sleep
  readonly zone: string
}

export const RunningSleepView = ({ sleep, zone }: RunningSleepViewProps) => {
  const sheets = useSheets()
  const now = useNow()
  const [session] = useState(() => wakeSession(failedFor(sheets, "sleep"), zone))
  const [woke, setWoke] = useState(session.when)
  const busy = sleepWaits(sheets.busy)
  const act = (action: SleepAction) => sheets.send({ sheet: "sleep", action })
  const wake = () => {
    const resolved = wakeAt(session, woke, zone, tapTime(), sleep.startedAt)
    if (resolved.ok) act(wakeAction(sleep, resolved.instant, session.actionId))
  }
  return (
    <>
      <FailureNote sheet="sleep" />
      <SleepTimer sleep={sleep} now={now} />
      <SleepStart sleep={sleep} zone={zone} busy={busy} />
      <SleepKindToggle
        kind={sleep.kind}
        disabled={busy}
        onChange={(kind) => {
          if (kind !== sleep.kind) act(runningEdit(sleep, kind, sleep.startedAt))
        }}
      />
      <WhenField
        label="Woke"
        when={woke}
        onChange={setWoke}
        zone={zone}
        now={now}
        earliest={sleep.startedAt}
        tooEarly={AFTER_SLEEP}
      />
      <Button
        size="lg"
        className="h-14 text-lg"
        disabled={busy || !wakeAt(session, woke, zone, now, sleep.startedAt).ok}
        onClick={wake}
      >
        Wake up
      </Button>
      <DeleteEntry noun="sleep" emptied={null} disabled={busy} onDelete={() => act(deleteAction(sleep))} />
    </>
  )
}

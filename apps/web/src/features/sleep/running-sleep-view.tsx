import type { Sleep } from "@bt/contracts"
import { useState } from "react"
import type { SleepAction } from "../../api/actions.ts"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { resolveWhen } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { SleepKindToggle } from "./sleep-kind-toggle.tsx"
import { AFTER_SLEEP, sentWake } from "./sleep-session.ts"
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
  const [woke, setWoke] = useState(() => sentWake(failedFor(sheets, "sleep"), zone))
  const busy = sleepWaits(sheets.busy)
  const act = (action: SleepAction) => sheets.send({ sheet: "sleep", action })
  const wake = () => {
    const resolved = resolveWhen(woke, zone, tapTime(), sleep.startedAt + 1)
    if (resolved.ok) act(wakeAction(sleep, resolved.instant))
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
        earliest={sleep.startedAt + 1}
        tooEarly={AFTER_SLEEP}
      />
      <Button
        size="lg"
        className="h-14 text-lg"
        disabled={busy || !resolveWhen(woke, zone, now, sleep.startedAt + 1).ok}
        onClick={wake}
      >
        Wake up
      </Button>
      <DeleteEntry noun="sleep" emptied={null} disabled={busy} onDelete={() => act(deleteAction(sleep))} />
    </>
  )
}

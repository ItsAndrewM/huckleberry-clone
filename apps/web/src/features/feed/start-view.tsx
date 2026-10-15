import type { Side } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { useNow } from "../../timer/use-now.ts"
import { startedAtOf, startSession } from "./nursing-session.ts"
import { SidePicker } from "./side-picker.tsx"

interface StartViewProps {
  readonly lastSide: Side | null
  readonly zone: string
}

export const StartView = ({ lastSide, zone }: StartViewProps) => {
  const sheets = useSheets()
  const [session] = useState(() => startSession(failedFor(sheets, "nursing"), zone))
  const [when, setWhen] = useState(session.when)
  const now = useNow()
  const start = (side: Side) => {
    if (sheets.open !== "nursing") return
    const resolved = startedAtOf(session, when, zone, tapTime())
    if (!resolved.ok) return
    const payload = { actionId: session.actionId, side, startedAt: resolved.instant }
    sheets.send({ sheet: "nursing", action: { kind: "startFeed", payload } })
  }
  return (
    <>
      <WhenField label="Started" when={when} onChange={setWhen} zone={zone} now={now} />
      <SidePicker
        label="Start on"
        lastSide={lastSide}
        disabled={!startedAtOf(session, when, zone, now).ok}
        onPick={start}
      />
      <FailureNote sheet="nursing" />
      <Button variant="ghost" size="lg" onClick={() => sheets.show("pastFeed")}>
        Log a past feed
      </Button>
    </>
  )
}

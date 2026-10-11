import type { Side } from "@bt/contracts"
import { useState } from "react"
import { FailureNote } from "../../sheets/failure-note.tsx"
import type { Failed } from "../../sheets/sending.ts"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { NOW, resolveWhen, type When, whenAt } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { SidePicker } from "./side-picker.tsx"

interface StartSession {
  readonly actionId: string
  readonly when: When
}

const startSession = (failed: Failed | null, zone: string): StartSession => {
  const action = failed?.sending.action
  if (action?.kind !== "startFeed") return { actionId: crypto.randomUUID(), when: NOW }
  return { actionId: action.payload.actionId, when: whenAt(action.payload.startedAt, zone) }
}

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
    const resolved = resolveWhen(when, zone, tapTime())
    if (!resolved.ok) return
    const payload = { actionId: session.actionId, side, startedAt: resolved.instant }
    sheets.send({ sheet: "nursing", action: { kind: "startFeed", payload } })
  }
  return (
    <>
      <WhenField label="Started" when={when} onChange={setWhen} zone={zone} now={now} />
      <SidePicker label="Start on" lastSide={lastSide} disabled={!resolveWhen(when, zone, now).ok} onPick={start} />
      <FailureNote sheet="nursing" />
    </>
  )
}

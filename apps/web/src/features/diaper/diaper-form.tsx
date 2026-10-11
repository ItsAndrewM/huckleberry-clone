import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import type { Household } from "../../sheets/failure.ts"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { resolveWhen } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { sessionOf } from "./diaper-session.ts"

const CHOICES = [
  { label: "Pee", wet: true, dirty: false },
  { label: "Poo", wet: false, dirty: true },
  { label: "Both", wet: true, dirty: true },
] as const

type Choice = (typeof CHOICES)[number]

export const DiaperForm = ({ household }: { readonly household: Household }) => {
  const sheets = useSheets()
  const zone = household.timeZone
  const [session] = useState(() => sessionOf(failedFor(sheets, "diaper"), zone))
  const [when, setWhen] = useState(session.when)
  const now = useNow()
  const ready = resolveWhen(when, zone, now).ok
  const log = ({ wet, dirty }: Choice) => {
    if (sheets.open !== "diaper") return
    const resolved = resolveWhen(when, zone, tapTime())
    if (!resolved.ok) return
    const payload = { actionId: session.actionId, occurredAt: resolved.instant, wet, dirty }
    sheets.send({ sheet: "diaper", action: { kind: "logDiaper", payload } })
  }
  return (
    <>
      <WhenField label="When" when={when} onChange={setWhen} zone={zone} now={now} />
      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((choice) => (
          <Button
            key={choice.label}
            variant="secondary"
            size="lg"
            className="h-16 text-lg"
            disabled={!ready}
            onClick={() => log(choice)}
          >
            {choice.label}
          </Button>
        ))}
      </div>
      <FailureNote sheet="diaper" />
    </>
  )
}

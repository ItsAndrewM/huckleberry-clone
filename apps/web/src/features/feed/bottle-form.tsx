import type { Feed, Prefill, VolumeUnit } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { DrawerDescription } from "../../components/ui/drawer.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { useNow } from "../../timer/use-now.ts"
import { AmountField } from "./amount-field.tsx"
import { bottleAction, bottleSession, canSaveBottle, occurredAtOf, toppedUpFor, topUpNote } from "./bottle-entry.ts"

interface BottleFormProps {
  readonly prefill: Prefill | undefined
  readonly active: Feed | null
  readonly unit: VolumeUnit
  readonly zone: string
}

export const BottleForm = ({ prefill, active, unit, zone }: BottleFormProps) => {
  const sheets = useSheets()
  const [session] = useState(() => bottleSession(failedFor(sheets, "bottle"), prefill, zone, sheets.at))
  const [amounts, setAmounts] = useState({ breastMilkMl: session.breastMilkMl, formulaMl: session.formulaMl })
  const [when, setWhen] = useState(session.when)
  const now = useNow()
  const picked = occurredAtOf(session, when, zone, now)
  const toppedUp = picked.ok ? toppedUpFor(active, picked.instant, session.held) : null
  const note = topUpNote(toppedUp, session.held, zone)
  const ready = picked.ok && canSaveBottle(amounts, toppedUp)
  const save = () => {
    if (sheets.open !== "bottle") return
    const resolved = occurredAtOf(session, when, zone, tapTime())
    if (!resolved.ok || !canSaveBottle(amounts, toppedUpFor(active, resolved.instant, session.held))) return
    const action = bottleAction(session.actionId, amounts, resolved.instant, active, session.held)
    sheets.send({ sheet: "bottle", action })
  }
  return (
    <>
      {note === null ? null : <DrawerDescription className="-mt-3">{note}</DrawerDescription>}
      <AmountField
        label="Breast milk"
        ml={amounts.breastMilkMl}
        unit={unit}
        onChange={(breastMilkMl) => setAmounts({ ...amounts, breastMilkMl })}
      />
      <AmountField
        label="Formula"
        ml={amounts.formulaMl}
        unit={unit}
        onChange={(formulaMl) => setAmounts({ ...amounts, formulaMl })}
      />
      <WhenField label="When" when={when} onChange={setWhen} zone={zone} now={now} />
      <Button size="lg" className="h-14 text-lg" disabled={!ready} onClick={save}>
        Save
      </Button>
      <FailureNote sheet="bottle" />
    </>
  )
}

import type { Supplement } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import type { Household } from "../../sheets/failure.ts"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { resolveWhen } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { doseSessionOf, duplicateOf } from "./dose-session.ts"
import { DuplicatePrompt } from "./duplicate-prompt.tsx"

interface DoseFormProps {
  readonly household: Household
  readonly supplement: Supplement
}

export const DoseForm = ({ household, supplement }: DoseFormProps) => {
  const sheets = useSheets()
  const zone = household.timeZone
  const failed = failedFor(sheets, "dose")
  const [session] = useState(() => doseSessionOf(failed, sheets.editing, zone, sheets.at))
  const [when, setWhen] = useState(session.when)
  const now = useNow()
  const duplicate = duplicateOf(failed)
  if (duplicate !== null) return <DuplicatePrompt duplicate={duplicate} name={supplement.name} household={household} />
  const log = () => {
    if (sheets.open !== "dose") return
    const resolved = resolveWhen(when, zone, tapTime())
    if (!resolved.ok) return
    const { actionId, confirmedDuplicate } = session
    const payload = { actionId, supplementId: supplement.id, occurredAt: resolved.instant, confirmedDuplicate }
    sheets.send({ sheet: "dose", action: { kind: "logDose", payload } })
  }
  return (
    <>
      <WhenField label="When" when={when} onChange={setWhen} zone={zone} now={now} />
      <Button
        size="lg"
        className="h-auto min-h-16 py-3 text-lg whitespace-normal wrap-anywhere"
        disabled={!resolveWhen(when, zone, now).ok}
        onClick={log}
      >
        Log {supplement.name}
      </Button>
      <FailureNote sheet="dose" />
    </>
  )
}

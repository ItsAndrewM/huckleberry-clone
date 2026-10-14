import type { Dose, RecentEntry } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { useNow } from "../../timer/use-now.ts"
import type { Display } from "../today/display.ts"
import { Parts } from "../today/parts.tsx"
import { doseDelete, doseEdit, doseEditSession, givenParts, movedTo } from "./dose-edit.ts"
import { EditFailure } from "./edit-failure.tsx"

interface EditDoseFormProps {
  readonly dose: Dose
  readonly display: Display
  readonly onUseTheirs: (current: RecentEntry) => void
}

export const EditDoseForm = ({ dose, display, onUseTheirs }: EditDoseFormProps) => {
  const sheets = useSheets()
  const zone = display.timeZone
  const [session] = useState(() => doseEditSession(failedFor(sheets, "editDose"), dose, zone))
  const [when, setWhen] = useState(session.when)
  const now = useNow()
  const save = () => {
    if (sheets.open !== "editDose") return
    const moved = movedTo(session, when, zone, tapTime())
    if (moved.ok) sheets.send({ sheet: "editDose", action: doseEdit(session, moved.instant) })
  }
  const remove = () => {
    if (sheets.open === "editDose") sheets.send({ sheet: "editDose", action: doseDelete(session.target) })
  }
  return (
    <>
      <EditFailure sheet="editDose" display={display} onUseTheirs={onUseTheirs} />
      <p className="text-base font-medium">
        <Parts parts={givenParts(display, dose)} freeText />
      </p>
      <WhenField label="When" when={when} onChange={setWhen} zone={zone} now={now} />
      <Button size="lg" className="h-14 text-lg" disabled={!movedTo(session, when, zone, now).ok} onClick={save}>
        Save
      </Button>
      <DeleteEntry noun="dose" emptied={null} onDelete={remove} />
    </>
  )
}

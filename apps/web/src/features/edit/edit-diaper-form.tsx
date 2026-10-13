import type { Diaper, RecentEntry } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { useNow } from "../../timer/use-now.ts"
import type { Display } from "../today/display.ts"
import { diaperDelete, diaperEdit, diaperEditSession, occurredAtOf } from "./diaper-edit.ts"
import { DiaperKinds } from "./diaper-kinds.tsx"
import { EditFailure } from "./edit-failure.tsx"

interface EditDiaperFormProps {
  readonly diaper: Diaper
  readonly display: Display
  readonly onUseTheirs: (current: RecentEntry) => void
}

export const EditDiaperForm = ({ diaper, display, onUseTheirs }: EditDiaperFormProps) => {
  const sheets = useSheets()
  const zone = display.timeZone
  const [session] = useState(() => diaperEditSession(failedFor(sheets, "editDiaper"), diaper, zone))
  const [when, setWhen] = useState(session.when)
  const [kind, setKind] = useState(session.kind)
  const now = useNow()
  const save = () => {
    if (sheets.open !== "editDiaper") return
    const resolved = occurredAtOf(session, when, zone, tapTime())
    if (resolved.ok) sheets.send({ sheet: "editDiaper", action: diaperEdit(session, kind, resolved.instant) })
  }
  const remove = () => {
    if (sheets.open === "editDiaper") sheets.send({ sheet: "editDiaper", action: diaperDelete(session.target) })
  }
  return (
    <>
      <EditFailure sheet="editDiaper" display={display} onUseTheirs={onUseTheirs} />
      <WhenField label="When" when={when} onChange={setWhen} zone={zone} now={now} />
      <DiaperKinds kind={kind} onChange={setKind} />
      <Button size="lg" className="h-14 text-lg" disabled={!occurredAtOf(session, when, zone, now).ok} onClick={save}>
        Save
      </Button>
      <DeleteEntry noun="diaper" emptied={null} onDelete={remove} />
    </>
  )
}

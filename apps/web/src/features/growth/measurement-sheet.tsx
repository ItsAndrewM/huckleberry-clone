import { useState } from "react"
import { useGrowth, useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { MeasurementForm } from "./measurement-form.tsx"
import { recordOf } from "./measurement-session.ts"

interface MeasurementContentProps {
  readonly editingId: string | null
  readonly open: boolean
}

const useDeletedLine = (missing: boolean, open: boolean) => {
  const [seen, setSeen] = useState(false)
  const shown = missing && (open || seen)
  if (shown && !seen) setSeen(true)
  return shown
}

const MeasurementContent = ({ editingId, open }: MeasurementContentProps) => {
  const { data: me } = useMe()
  const { data: growth } = useGrowth()
  const editing = growth?.measurements.find(({ id }) => id === editingId) ?? null
  const deleted = useDeletedLine(growth !== undefined && editingId !== null && editing === null, open)
  if (me === undefined || (editingId !== null && growth === undefined)) return null
  if (deleted) return <p className="text-sm text-muted-foreground">This measurement was deleted.</p>
  return <MeasurementForm me={me} editing={editing} />
}

export const MeasurementSheet = () => {
  const sheets = useSheets()
  const record = recordOf(failedFor(sheets, "measurement"), sheets.editing)
  const [opening, setOpening] = useState({ opened: sheets.opened, record })
  if (opening.opened !== sheets.opened) setOpening({ opened: sheets.opened, record })
  const editingId = opening.opened === sheets.opened ? opening.record : record
  return (
    <Sheet sheet="measurement" title={editingId === null ? "Add measurement" : "Edit measurement"}>
      <MeasurementContent editingId={editingId} open={sheets.open === "measurement"} />
    </Sheet>
  )
}

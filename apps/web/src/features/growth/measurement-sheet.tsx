import { useGrowth, useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { MeasurementForm } from "./measurement-form.tsx"
import { recordOf } from "./measurement-session.ts"

interface MeasurementContentProps {
  readonly editingId: string | null
  readonly open: boolean
}

const MeasurementContent = ({ editingId, open }: MeasurementContentProps) => {
  const { data: me } = useMe()
  const { data: growth } = useGrowth()
  if (me === undefined || (editingId !== null && growth === undefined)) return null
  const editing = growth?.measurements.find(({ id }) => id === editingId) ?? null
  if (open && editingId !== null && editing === null) {
    return <p className="text-sm text-muted-foreground">This measurement was deleted.</p>
  }
  return <MeasurementForm me={me} editing={editing} />
}

export const MeasurementSheet = () => {
  const sheets = useSheets()
  const editingId = recordOf(failedFor(sheets, "measurement"), sheets.editing)
  return (
    <Sheet sheet="measurement" title={editingId === null ? "Add measurement" : "Edit measurement"}>
      <MeasurementContent editingId={editingId} open={sheets.open === "measurement"} />
    </Sheet>
  )
}

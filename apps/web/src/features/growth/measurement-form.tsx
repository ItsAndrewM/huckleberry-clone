import type { Measurement, Me } from "@bt/contracts"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { WhenField } from "../../sheets/when-field.tsx"
import { DeleteMeasurement } from "./delete-measurement.tsx"
import { EntryField } from "./entry-field.tsx"
import { entryMessage, LENGTH_UNITS, WEIGHT_UNITS } from "./entry-text.ts"
import { useMeasurementForm } from "./use-measurement-form.ts"

interface MeasurementFormProps {
  readonly me: Me
  readonly editing: Measurement | null
}

export const MeasurementForm = ({ me, editing }: MeasurementFormProps) => {
  const { target, form, setForm, readings, ready, cleared, save, remove, zone, now } = useMeasurementForm(me, editing)
  return (
    <>
      <FailureNote sheet="measurement" />
      <WhenField label="When" when={form.when} onChange={(when) => setForm({ ...form, when })} zone={zone} now={now} />
      <EntryField
        label="Weight"
        entry={form.weightG}
        units={WEIGHT_UNITS}
        message={entryMessage(readings.weightG)}
        onChange={(weightG) => setForm({ ...form, weightG })}
      />
      <EntryField
        label="Length"
        entry={form.lengthCm}
        units={LENGTH_UNITS}
        message={entryMessage(readings.lengthCm)}
        onChange={(lengthCm) => setForm({ ...form, lengthCm })}
      />
      <EntryField
        label="Head circumference"
        entry={form.headCm}
        units={LENGTH_UNITS}
        message={entryMessage(readings.headCm)}
        onChange={(headCm) => setForm({ ...form, headCm })}
      />
      {cleared ? null : (
        <Button size="lg" className="h-14 text-lg" disabled={!ready} onClick={save}>
          Save
        </Button>
      )}
      {target === null ? null : <DeleteMeasurement cleared={cleared} onDelete={remove} />}
    </>
  )
}

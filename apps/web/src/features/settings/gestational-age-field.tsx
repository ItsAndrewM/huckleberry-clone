import { Input } from "../../components/ui/input.tsx"
import { weeksAndDays } from "./child-fields.ts"

const ERROR_ID = "gestational-age-error"

const PartOfAge = ({ name, defaultValue }: { readonly name: "weeks" | "days"; readonly defaultValue: number }) => (
  <label className="flex items-center gap-2">
    <Input name={name} type="number" inputMode="numeric" defaultValue={defaultValue} />
    <span className="text-base">{name}</span>
  </label>
)

interface GestationalAgeFieldProps {
  readonly gestationalAgeDays: number
  readonly error: string | undefined
}

export const GestationalAgeField = ({ gestationalAgeDays, error }: GestationalAgeFieldProps) => {
  const { weeks, days } = weeksAndDays(gestationalAgeDays)
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error === undefined ? undefined : ERROR_ID}>
      <legend className="mb-2 text-sm font-medium">Born at</legend>
      <div className="grid grid-cols-2 gap-3">
        <PartOfAge name="weeks" defaultValue={weeks} />
        <PartOfAge name="days" defaultValue={days} />
      </div>
      {error === undefined ? null : (
        <p id={ERROR_ID} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}

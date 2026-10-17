import { FieldMessage } from "../../components/field-message.tsx"
import { Input } from "../../components/ui/input.tsx"
import { weeksAndDays } from "./child-fields.ts"

const ERROR_ID = "gestational-age-error"

interface PartOfAgeProps {
  readonly name: "weeks" | "days"
  readonly defaultValue: number
  readonly invalid: boolean
}

const PartOfAge = ({ name, defaultValue, invalid }: PartOfAgeProps) => (
  <label className="flex items-center gap-2">
    <Input
      name={name}
      type="number"
      inputMode="numeric"
      defaultValue={defaultValue}
      aria-invalid={invalid}
      aria-describedby={ERROR_ID}
    />
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
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Born at</legend>
      <div className="grid grid-cols-2 gap-3">
        <PartOfAge name="weeks" defaultValue={weeks} invalid={error !== undefined} />
        <PartOfAge name="days" defaultValue={days} invalid={error !== undefined} />
      </div>
      <FieldMessage id={ERROR_ID}>{error}</FieldMessage>
    </fieldset>
  )
}

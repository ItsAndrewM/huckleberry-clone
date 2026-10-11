import { Input } from "../../components/ui/input.tsx"
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select.tsx"
import type { UnitChoice } from "./entry-text.ts"
import { type Entry, type EntryUnit, withUnit } from "./entry.ts"

interface EntryFieldProps<Unit extends EntryUnit> {
  readonly label: string
  readonly entry: Entry<Unit>
  readonly units: ReadonlyArray<UnitChoice<Unit>>
  readonly message: string | null
  readonly onChange: (entry: Entry<Unit>) => void
}

interface NumberProps {
  readonly label: string
  readonly value: string
  readonly invalid: boolean
  readonly onChange: (value: string) => void
}

const NumberInput = ({ label, value, invalid, onChange }: NumberProps) => (
  <Input
    aria-label={label}
    inputMode="decimal"
    className="tabular-nums"
    value={value}
    aria-invalid={invalid}
    onChange={(event) => onChange(event.target.value)}
  />
)

export const EntryField = <Unit extends EntryUnit>({
  label,
  entry,
  units,
  message,
  onChange,
}: EntryFieldProps<Unit>) => {
  const invalid = message !== null
  const pick = (value: string) => {
    const choice = units.find(({ unit }) => unit === value)
    if (choice !== undefined) onChange(withUnit(entry, choice.unit))
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-2">
        {entry.unit === "lb_oz" ? (
          <>
            <NumberInput
              label="Pounds"
              value={entry.text}
              invalid={invalid}
              onChange={(text) => onChange({ ...entry, text })}
            />
            <span className="text-sm text-muted-foreground">lb</span>
            <NumberInput
              label="Ounces"
              value={entry.ounces}
              invalid={invalid}
              onChange={(ounces) => onChange({ ...entry, ounces })}
            />
            <span className="text-sm text-muted-foreground">oz</span>
          </>
        ) : (
          <NumberInput
            label={label}
            value={entry.text}
            invalid={invalid}
            onChange={(text) => onChange({ ...entry, text })}
          />
        )}
        <NativeSelect
          aria-label={`${label} unit`}
          className="shrink-0"
          value={entry.unit}
          onChange={(event) => pick(event.target.value)}
        >
          {units.map(({ unit, label: name }) => (
            <NativeSelectOption key={unit} value={unit}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {message === null ? null : <p className="text-sm text-destructive">{message}</p>}
    </fieldset>
  )
}

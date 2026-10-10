import type { Household } from "@bt/contracts"
import { useSaveHousehold } from "../../api/hooks.ts"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import { SaveFailure } from "./save-failure.tsx"
import { UNIT_ROWS, unitChange } from "./units.ts"

interface UnitPickerProps {
  readonly row: (typeof UNIT_ROWS)[number]
  readonly household: Household
}

export const UnitPicker = ({ row, household }: UnitPickerProps) => {
  const save = useSaveHousehold()
  const units = save.isPending ? { ...household.units, ...save.variables.change.units } : household.units
  const chosen = units[row.kind]
  const labelId = `${row.kind}-unit-label`
  const choose = (value: string | undefined) => {
    const picked = value === undefined || value === chosen ? undefined : unitChange(row.kind, value)
    if (picked !== undefined) save.mutate({ household, change: { units: picked } })
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span id={labelId} className="w-16 shrink-0 text-sm">
          {row.label}
        </span>
        <ToggleGroup
          aria-labelledby={labelId}
          value={[chosen]}
          onValueChange={([next]) => choose(next)}
          variant="outline"
          size="lg"
          className="flex-1"
        >
          {row.options.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className="flex-1">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <SaveFailure error={save.error} />
    </div>
  )
}

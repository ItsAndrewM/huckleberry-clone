import { FieldMessage } from "../components/field-message.tsx"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group.tsx"
import { clockOf } from "./clock.ts"
import { ambiguity, type Pick, type When } from "./when.ts"

interface AmbiguityChoiceProps {
  readonly id: string
  readonly when: When
  readonly zone: string
  readonly onChange: (when: When) => void
}

const PICKS = [
  { value: "earlier", label: "first" },
  { value: "later", label: "second" },
] as const satisfies ReadonlyArray<{ value: Exclude<Pick, null>; label: string }>

export const AmbiguityChoice = ({ id, when, zone, onChange }: AmbiguityChoiceProps) => {
  const twice = ambiguity(when, zone)
  const clock = twice?.kind === "ambiguous" ? clockOf(twice.earlier, zone) : null
  return (
    <>
      <FieldMessage id={id} className="text-inherit">
        {clock === null ? null : `The clocks went back, so ${clock} happened twice. Which one?`}
      </FieldMessage>
      {clock === null || when.kind === "now" ? null : (
        <ToggleGroup
          aria-labelledby={id}
          value={when.pick === null ? [] : [when.pick]}
          onValueChange={([next]) => {
            const pick = PICKS.find(({ value }) => value === next)
            if (pick !== undefined) onChange({ ...when, pick: pick.value })
          }}
          variant="outline"
          size="lg"
          className="w-full"
        >
          {PICKS.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className="flex-1">
              {clock} ({label})
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </>
  )
}

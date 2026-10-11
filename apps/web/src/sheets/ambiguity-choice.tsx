import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group.tsx"
import { ambiguity, type Pick, type When } from "./when.ts"

interface AmbiguityChoiceProps {
  readonly when: When
  readonly zone: string
  readonly onChange: (when: When) => void
}

const PICKS = [
  { value: "earlier", label: "first" },
  { value: "later", label: "second" },
] as const satisfies ReadonlyArray<{ value: Exclude<Pick, null>; label: string }>

const clockOf = (instant: number, zone: string) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone }).format(instant)

export const AmbiguityChoice = ({ when, zone, onChange }: AmbiguityChoiceProps) => {
  const twice = ambiguity(when, zone)
  if (when.kind === "now" || twice?.kind !== "ambiguous") return null
  const clock = clockOf(twice.earlier, zone)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm">The clocks went back, so {clock} happened twice. Which one?</legend>
      <ToggleGroup
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
    </fieldset>
  )
}

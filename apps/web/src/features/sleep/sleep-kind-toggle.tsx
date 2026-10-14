import type { SleepKind } from "@bt/contracts"
import { SLEEP_KINDS } from "@bt/domain"
import { useId } from "react"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import { SLEEP_TITLES } from "../today/sleep-parts.ts"

interface SleepKindToggleProps {
  readonly kind: SleepKind
  readonly disabled?: boolean
  readonly onChange: (kind: SleepKind) => void
}

export const SleepKindToggle = ({ kind, disabled = false, onChange }: SleepKindToggleProps) => {
  const labelId = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={labelId} className="text-sm font-medium">
        Nap or night
      </span>
      <ToggleGroup
        aria-labelledby={labelId}
        value={[kind]}
        onValueChange={([next]) => onChange(SLEEP_KINDS.find((candidate) => candidate === next) ?? kind)}
        disabled={disabled}
        variant="outline"
        size="lg"
      >
        {SLEEP_KINDS.map((candidate) => (
          <ToggleGroupItem key={candidate} value={candidate}>
            {SLEEP_TITLES[candidate]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

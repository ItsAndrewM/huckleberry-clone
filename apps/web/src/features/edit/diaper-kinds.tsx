import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import type { DiaperKind } from "./diaper-edit.ts"

const KINDS = [
  { value: "pee", label: "Pee", wet: true, dirty: false },
  { value: "poo", label: "Poo", wet: false, dirty: true },
  { value: "both", label: "Both", wet: true, dirty: true },
] as const

interface DiaperKindsProps {
  readonly kind: DiaperKind
  readonly onChange: (kind: DiaperKind) => void
}

export const DiaperKinds = ({ kind, onChange }: DiaperKindsProps) => {
  const shown = KINDS.find(({ wet, dirty }) => wet === kind.wet && dirty === kind.dirty)
  return (
    <div className="flex items-center justify-between gap-3">
      <span id="diaper-kind-label" className="text-base font-medium">
        Diaper
      </span>
      <ToggleGroup
        aria-labelledby="diaper-kind-label"
        value={shown === undefined ? [] : [shown.value]}
        onValueChange={([next]) => {
          const picked = KINDS.find(({ value }) => value === next)
          if (picked !== undefined) onChange({ wet: picked.wet, dirty: picked.dirty })
        }}
        variant="outline"
        size="lg"
      >
        {KINDS.map(({ value, label }) => (
          <ToggleGroupItem key={value} value={value}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

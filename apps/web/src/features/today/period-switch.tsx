import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"

export type Period = "today" | "last24h"

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "last24h", label: "Last 24 h" },
] as const satisfies ReadonlyArray<{ value: Period; label: string }>

interface PeriodSwitchProps {
  readonly period: Period
  readonly onChange: (period: Period) => void
}

export const PeriodSwitch = ({ period, onChange }: PeriodSwitchProps) => (
  <ToggleGroup
    aria-label="Totals for"
    value={[period]}
    onValueChange={([next]) => {
      const picked = PERIODS.find(({ value }) => value === next)
      if (picked !== undefined) onChange(picked.value)
    }}
    variant="outline"
    size="lg"
  >
    {PERIODS.map(({ value, label }) => (
      <ToggleGroupItem key={value} value={value}>
        {label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
)

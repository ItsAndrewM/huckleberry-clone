import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import { GROWTH_METRICS, type GrowthMetricInfo } from "./metrics.ts"

interface MetricSwitchProps {
  readonly info: GrowthMetricInfo
  readonly onChange: (info: GrowthMetricInfo) => void
}

export const MetricSwitch = ({ info, onChange }: MetricSwitchProps) => {
  const choose = ([next]: ReadonlyArray<string>) => {
    const picked = GROWTH_METRICS.find(({ metric }) => metric === next)
    if (picked !== undefined) onChange(picked)
  }
  return (
    <ToggleGroup
      aria-label="Measurement"
      value={[info.metric]}
      onValueChange={choose}
      variant="outline"
      size="lg"
      className="w-full"
    >
      {GROWTH_METRICS.map(({ metric, label }) => (
        <ToggleGroupItem key={metric} value={metric} className="flex-1">
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

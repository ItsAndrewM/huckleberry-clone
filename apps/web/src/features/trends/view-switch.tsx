import type { LocalDate } from "@bt/contracts"
import { useNavigate } from "@tanstack/react-router"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import type { TrendsPeriod, TrendsView } from "./trends-period.ts"
import { viewSearch } from "./trends-search.ts"

const VIEWS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const satisfies ReadonlyArray<{ value: TrendsView; label: string }>

interface ViewSwitchProps {
  readonly period: TrendsPeriod
  readonly today: LocalDate
  readonly birthDate: LocalDate
}

export const ViewSwitch = ({ period, today, birthDate }: ViewSwitchProps) => {
  const navigate = useNavigate()
  return (
    <ToggleGroup
      aria-label="Trends by"
      value={[period.view]}
      onValueChange={([next]) => {
        const view = VIEWS.find(({ value }) => value === next)?.value
        if (view !== undefined)
          void navigate({ to: "/trends", search: viewSearch(view, period, today, birthDate, null) })
      }}
      variant="outline"
      size="lg"
      className="w-full"
    >
      {VIEWS.map(({ value, label }) => (
        <ToggleGroupItem key={value} value={value} className="flex-1">
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

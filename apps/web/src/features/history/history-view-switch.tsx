import type { LocalDate } from "@bt/contracts"
import { useNavigate } from "@tanstack/react-router"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import type { Hidden } from "./history-kinds.ts"
import { viewSearch } from "./history-navigation.ts"
import type { HistoryPeriod, HistoryView } from "./history-period.ts"

const VIEWS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
] as const satisfies ReadonlyArray<{ value: HistoryView; label: string }>

interface HistoryViewSwitchProps {
  readonly period: HistoryPeriod
  readonly today: LocalDate
  readonly birthDate: LocalDate
  readonly hidden: Hidden
}

export const HistoryViewSwitch = ({ period, today, birthDate, hidden }: HistoryViewSwitchProps) => {
  const navigate = useNavigate()
  return (
    <ToggleGroup
      aria-label="History by"
      value={[period.view]}
      onValueChange={([next]) => {
        const view = VIEWS.find(({ value }) => value === next)?.value
        if (view !== undefined)
          void navigate({ to: "/history", search: viewSearch(view, period, today, birthDate, hidden) })
      }}
      variant="outline"
      size="lg"
    >
      {VIEWS.map(({ value, label }) => (
        <ToggleGroupItem key={value} value={value}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

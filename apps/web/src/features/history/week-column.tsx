import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import type { HistorySearch } from "./history-date.ts"
import { WeekDayHeader } from "./week-day-header.tsx"
import { WeekMarks } from "./week-marks.tsx"
import type { WeekColumn } from "./week-model.ts"

interface WeekColumnProps {
  readonly column: WeekColumn
  readonly name: string
  readonly search: HistorySearch
  readonly locale: string | undefined
}

export const WeekColumnView = ({ column, name, search, locale }: WeekColumnProps) => (
  <li className="relative flex min-w-10 flex-1 flex-col">
    <WeekDayHeader date={column.date} isToday={column.isToday} measured={column.measured} locale={locale} />
    <div
      className={cn(
        "relative flex-1 overflow-hidden rounded-md [container-type:size] [--cal-step:calc(100cqh/144)]",
        column.opens ? "bg-card" : "outline-1 -outline-offset-1 outline-dashed outline-border",
      )}
    >
      <span aria-hidden="true" className="week-hours absolute inset-0" />
      {column.opens ? <WeekMarks column={column} /> : null}
    </div>
    {column.opens ? (
      <Link
        to="/history"
        search={search}
        activeOptions={{ exact: true }}
        aria-label={name}
        className="absolute inset-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      />
    ) : null}
  </li>
)

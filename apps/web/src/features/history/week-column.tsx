import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import type { HistorySearch } from "./history-date.ts"
import { WeekDayHeader } from "./week-day-header.tsx"
import type { WeekColumn } from "./week-model.ts"

interface WeekColumnProps {
  readonly column: WeekColumn
  readonly name: string
  readonly search: HistorySearch
  readonly locale: string | undefined
}

export const WeekColumnView = ({ column, name, search, locale }: WeekColumnProps) => (
  <li className="flex min-w-10 flex-1 flex-col">
    <WeekDayHeader date={column.date} isToday={column.isToday} measured={column.measured} locale={locale} />
    <div className={cn("relative flex-1 overflow-hidden rounded-md", column.opens ? "bg-card" : "bg-muted/50")}>
      {column.opens ? (
        <Link
          to="/history"
          search={search}
          aria-label={name}
          className="absolute inset-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        />
      ) : null}
    </div>
  </li>
)

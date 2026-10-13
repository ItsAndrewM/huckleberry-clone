import type { LocalDate } from "@bt/contracts"
import type { Display } from "../today/display.ts"
import type { Hidden } from "./history-kinds.ts"
import { daySearch } from "./history-navigation.ts"
import { WeekColumnView } from "./week-column.tsx"
import type { WeekColumn } from "./week-model.ts"
import { columnName } from "./week-names.ts"

interface WeekGridProps {
  readonly columns: ReadonlyArray<WeekColumn>
  readonly display: Display
  readonly today: LocalDate
  readonly hidden: Hidden
}

export const WeekGrid = ({ columns, display, today, hidden }: WeekGridProps) => (
  <section aria-label="The week by hour" className="flex min-h-72 flex-1 flex-col gap-2">
    <ol className="flex flex-1 gap-0.5">
      {columns.map((column) => (
        <WeekColumnView
          key={column.date}
          column={column}
          name={columnName(column, display.volume, hidden, display.locale)}
          search={daySearch(column.date, today, hidden)}
          locale={display.locale}
        />
      ))}
    </ol>
  </section>
)

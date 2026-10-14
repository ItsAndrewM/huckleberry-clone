import type { LocalDate, VolumeUnit } from "@bt/contracts"
import { Link } from "@tanstack/react-router"
import { historySearchOf } from "./history-link.ts"
import { TRENDS_METRICS } from "./metrics.ts"
import { tableRows } from "./table-rows.ts"
import type { TrendDay } from "./trends-numbers.ts"

interface TrendsTableProps {
  readonly days: ReadonlyArray<TrendDay>
  readonly volume: VolumeUnit
  readonly today: LocalDate
}

export const TrendsTable = ({ days, volume, today }: TrendsTableProps) => (
  <details>
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">
      Show as a table
    </summary>
    <table className="w-full text-left text-sm tabular-nums">
      <caption className="sr-only">Each day's totals, oldest first</caption>
      <thead className="text-muted-foreground">
        <tr>
          <th scope="col" className="py-2 pr-2 font-medium">
            Day
          </th>
          {TRENDS_METRICS.map(({ id, title }) => (
            <th key={id} scope="col" className="py-2 pr-2 font-medium">
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableRows(days, volume).map(({ date, name, cells }) => (
          <tr key={date} className="border-t">
            <th scope="row" className="py-2 pr-2 font-normal">
              <Link
                to="/history"
                search={historySearchOf(date, today)}
                resetScroll={false}
                className="-my-2 flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
              >
                {name}
              </Link>
            </th>
            {cells.length === 1 ? (
              <td colSpan={TRENDS_METRICS.length} className="py-2 whitespace-nowrap text-muted-foreground">
                {cells[0]}
              </td>
            ) : (
              cells.map((cell, index) => (
                <td key={TRENDS_METRICS[index]?.id} className="py-2 pr-2 whitespace-nowrap">
                  {cell}
                </td>
              ))
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </details>
)

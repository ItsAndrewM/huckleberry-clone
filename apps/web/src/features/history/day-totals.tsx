import type { DayPeriod, Me } from "@bt/contracts"
import { RulerIcon } from "lucide-react"
import { useSheets } from "../../sheets/sheets-context.ts"
import { Parts } from "../today/parts.tsx"
import { growthItems, nothingLogged, totalsLines } from "./day-summary.ts"
import type { Hidden } from "./history-kinds.ts"

interface DayTotalsProps {
  readonly day: DayPeriod
  readonly me: Me
  readonly hidden: Hidden
}

export const DayTotals = ({ day, me, hidden }: DayTotalsProps) => {
  const sheets = useSheets()
  const { volume } = me.household.units
  const lines = totalsLines(day.totals, volume)
  const measured = growthItems(day.measurements, me.household.units, me.household.timeZone)
  const growth = hidden.has("growth") ? [] : measured
  return (
    <section aria-label="This day" className="flex flex-col gap-2">
      {nothingLogged(day, volume) ? <p className="text-sm text-muted-foreground">Nothing logged.</p> : null}
      {lines.length === 0 ? null : (
        <div className="text-sm tabular-nums text-muted-foreground">
          {lines.map((parts) => (
            <p key={parts.join()}>
              <Parts parts={parts} />
            </p>
          ))}
        </div>
      )}
      {growth.map(({ id, time, values, name }) => (
        <button
          key={id}
          type="button"
          aria-label={name}
          onClick={() => sheets.show("measurement", id)}
          className="flex min-h-11 items-center gap-2 rounded-lg bg-secondary px-3 text-left text-sm text-secondary-foreground tabular-nums"
        >
          <RulerIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="font-medium">{time}</span>
          <span className="min-w-0 flex-1 truncate">
            <Parts parts={values} />
          </span>
        </button>
      ))}
    </section>
  )
}

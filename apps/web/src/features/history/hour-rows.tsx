import type { HourRow } from "@bt/domain"
import { cn } from "cn"
import type { Display } from "../today/display.ts"
import { atStep, stepsTall } from "./grid-classes.ts"
import { hourLabels } from "./hour-labels.ts"

interface HourRowsProps {
  readonly rows: ReadonlyArray<HourRow>
  readonly display: Display
}

export const HourRows = ({ rows, display }: HourRowsProps) => {
  const labels = hourLabels(rows, display.timeZone, display.locale)
  return rows.map((row, index) => (
    <div
      key={row.start}
      className={cn("absolute inset-x-0 border-t border-border/70", atStep(row.top), stepsTall(row.height))}
    >
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 w-11 -translate-y-1/2 bg-background pr-1 text-right text-[0.6875rem] leading-4 text-muted-foreground tabular-nums"
      >
        {labels[index]}
      </span>
    </div>
  ))
}

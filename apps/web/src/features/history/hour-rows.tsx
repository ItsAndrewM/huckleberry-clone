import type { HourRow } from "@bt/domain"
import { cn } from "cn"
import type { MouseEvent } from "react"
import type { Display } from "../today/display.ts"
import { atStep, stepsTall, tapFraction } from "./grid-classes.ts"
import { hourLabels, hourNames } from "./hour-labels.ts"

interface HourRowsProps {
  readonly rows: ReadonlyArray<HourRow>
  readonly display: Display
  readonly now: number
  readonly onTap: (row: HourRow, fraction: number) => void
}

const fractionOf = (event: MouseEvent<HTMLButtonElement>) => {
  const { top, height } = event.currentTarget.getBoundingClientRect()
  return tapFraction(event.clientY, top, height, event.detail === 0)
}

export const HourRows = ({ rows, display, now, onTap }: HourRowsProps) => {
  const labels = hourLabels(rows, display.timeZone, display.locale)
  const names = hourNames(rows, labels)
  return rows.map((row, index) => (
    <button
      key={row.start}
      type="button"
      aria-label={names[index]}
      disabled={row.start > now}
      onClick={(event) => onTap(row, fractionOf(event))}
      className={cn(
        "absolute inset-x-0 border-t border-border/70 text-left outline-none",
        "focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
        atStep(row.top),
        stepsTall(row.height),
      )}
    >
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 w-11 -translate-y-1/2 bg-background pr-1 text-right text-[0.6875rem] leading-4 text-muted-foreground tabular-nums"
      >
        {labels[index]}
      </span>
    </button>
  ))
}

import type { LocalDate } from "@bt/contracts"
import { cn } from "cn"
import { RulerIcon } from "lucide-react"
import { dayOfMonth, weekdayOf } from "./history-date.ts"

interface WeekDayHeaderProps {
  readonly date: LocalDate
  readonly isToday: boolean
  readonly measured: boolean
  readonly locale: string | undefined
}

export const WeekDayHeader = ({ date, isToday, measured, locale }: WeekDayHeaderProps) => (
  <div
    aria-hidden="true"
    className={cn(
      "flex h-10 shrink-0 flex-col items-center justify-center text-muted-foreground tabular-nums",
      isToday && "text-primary",
    )}
  >
    <span className="text-[0.6875rem] leading-3.5">{weekdayOf(date, locale)}</span>
    <span className="flex items-center gap-0.5 text-sm leading-4.5 font-medium">
      <span className={cn(isToday && "font-semibold")}>{dayOfMonth(date)}</span>
      {measured ? <RulerIcon className="size-3" /> : null}
    </span>
  </div>
)

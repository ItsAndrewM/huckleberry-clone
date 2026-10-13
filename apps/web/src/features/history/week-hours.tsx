import { cn } from "cn"
import { atStep } from "./grid-classes.ts"

const LABELLED_HOURS = [0, 6, 12, 18]
const STEPS_PER_HOUR = 6

const hourLabel = (hour: number, locale: string | undefined) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, hour))

export const WeekHours = ({ locale }: { readonly locale: string | undefined }) => (
  <div aria-hidden="true" className="sticky left-0 z-10 flex w-9 shrink-0 flex-col bg-background pr-1">
    <div className="h-10 shrink-0" />
    <div className="relative flex-1 [container-type:size] [--cal-step:calc(100cqh/144)]">
      {LABELLED_HOURS.map((hour) => (
        <span
          key={hour}
          className={cn(
            "absolute right-0 text-[0.625rem] leading-3 whitespace-nowrap text-muted-foreground tabular-nums",
            hour === 0 ? "translate-y-0" : "-translate-y-1/2",
            atStep(hour * STEPS_PER_HOUR),
          )}
        >
          {hourLabel(hour, locale)}
        </span>
      ))}
    </div>
  </div>
)

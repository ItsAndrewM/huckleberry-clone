import type { LocalDate } from "@bt/contracts"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import { HistoryLink } from "./history-link-view.tsx"
import { dayName } from "./trends-titles.ts"

interface PickedDayProps {
  readonly date: LocalDate | null
  readonly today: LocalDate
  readonly onClear: () => void
}

export const PickedDay = ({ date, today, onClear }: PickedDayProps) => {
  const isPicked = date !== null
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-lg bg-secondary pl-3 text-sm text-secondary-foreground">
      <output className={cn("tabular-nums", isPicked ? "font-medium" : "text-muted-foreground")}>
        {isPicked ? (
          dayName(date)
        ) : (
          <>
            <span className="sr-only">Showing averages. </span>Tap a day to see its numbers
          </>
        )}
      </output>
      {isPicked ? (
        <>
          <div className="flex-1">
            <HistoryLink date={date} today={today} />
          </div>
          <Button variant="ghost" size="icon-lg" aria-label="Back to the averages" onClick={onClear}>
            <XIcon aria-hidden="true" className="size-5" />
          </Button>
        </>
      ) : null}
    </div>
  )
}

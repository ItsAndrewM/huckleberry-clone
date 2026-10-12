import type { LocalDate } from "@bt/contracts"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import { dayName } from "./trends-titles.ts"

interface PickedDayProps {
  readonly date: LocalDate | null
  readonly onClear: () => void
}

export const PickedDay = ({ date, onClear }: PickedDayProps) => {
  const isPicked = date !== null
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-sm",
        isPicked ? "min-h-11 rounded-lg bg-secondary pl-3 text-secondary-foreground" : "sr-only",
      )}
    >
      <output className="flex-1 font-medium tabular-nums">{isPicked ? dayName(date) : null}</output>
      {isPicked ? (
        <Button variant="ghost" size="icon-lg" aria-label="Back to the averages" onClick={onClear}>
          <XIcon aria-hidden="true" className="size-5" />
        </Button>
      ) : null}
    </div>
  )
}

import type { LocalDate } from "@bt/contracts"
import { XIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import { dayName } from "./trends-titles.ts"

interface PickedDayProps {
  readonly date: LocalDate
  readonly onClear: () => void
}

export const PickedDay = ({ date, onClear }: PickedDayProps) => (
  <div className="flex min-h-11 items-center gap-3 rounded-lg bg-secondary pl-3 text-sm text-secondary-foreground">
    <output className="flex-1 font-medium tabular-nums">{dayName(date)}</output>
    <Button variant="ghost" size="icon-lg" aria-label="Back to the averages" onClick={onClear}>
      <XIcon aria-hidden="true" className="size-5" />
    </Button>
  </div>
)

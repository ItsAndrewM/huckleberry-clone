import type { DayPeriod, Me } from "@bt/contracts"
import { DayTotals } from "./day-totals.tsx"

interface DayViewProps {
  readonly day: DayPeriod
  readonly me: Me
  readonly now: number
}

export const DayView = ({ day, me }: DayViewProps) => <DayTotals day={day} me={me} />

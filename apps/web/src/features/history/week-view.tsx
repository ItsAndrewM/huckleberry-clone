import type { IsoWeek, LocalDate, Me } from "@bt/contracts"
import { useWeek } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { displayOf } from "../today/display.ts"
import type { Hidden } from "./history-kinds.ts"
import { WeekGrid } from "./week-grid.tsx"
import { weekModel } from "./week-model.ts"

interface WeekViewProps {
  readonly week: IsoWeek
  readonly me: Me
  readonly now: number
  readonly today: LocalDate
  readonly hidden: Hidden
}

export const WeekView = ({ week, me, now, today, hidden }: WeekViewProps) => {
  const weekQuery = useWeek(week)
  if (weekQuery.data === undefined)
    return <NotLoaded failed={weekQuery.isError} message="This week couldn't be loaded." retry={retryOf(weekQuery)} />
  const display = displayOf(me.household)
  const context = { zone: display.timeZone, now, today, birthDate: me.child.birthDate, hidden }
  return <WeekGrid columns={weekModel(weekQuery.data, context)} display={display} today={today} hidden={hidden} />
}

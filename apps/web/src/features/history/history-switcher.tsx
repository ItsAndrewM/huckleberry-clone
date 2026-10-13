import type { LocalDate } from "@bt/contracts"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { buttonVariants } from "../../components/ui/button.tsx"
import { GoToDate } from "./go-to-date.tsx"
import type { HistorySearch } from "./history-date.ts"
import type { Hidden } from "./history-kinds.ts"
import { type HistoryNavigation, searchFor } from "./history-navigation.ts"
import { firstDateOf, type HistoryView, periodOf } from "./history-period.ts"
import { backLabel, currentLabel, periodTitle } from "./history-titles.ts"

const NAMES = { day: "Days", week: "Weeks" } as const satisfies Record<HistoryView, string>

const LINK_TEXT =
  "-my-3.5 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline"

interface StepProps {
  readonly search: HistorySearch | null
  readonly label: string
  readonly Icon: LucideIcon
}

const Step = ({ search, label, Icon }: StepProps) =>
  search === null ? (
    <span aria-hidden="true" className="size-11" />
  ) : (
    <Link
      to="/history"
      search={search}
      activeOptions={{ exact: true }}
      aria-label={label}
      className={buttonVariants({ variant: "ghost", size: "icon-lg" })}
    >
      <Icon aria-hidden="true" className="size-5" />
    </Link>
  )

interface HistorySwitcherProps {
  readonly navigation: HistoryNavigation
  readonly today: LocalDate
  readonly birthDate: LocalDate
  readonly hidden: Hidden
}

export const HistorySwitcher = ({ navigation, today, birthDate, hidden }: HistorySwitcherProps) => {
  const [changing, setChanging] = useState(false)
  const navigate = useNavigate()
  const { period, isCurrent } = navigation
  const noun = period.view
  const goTo = (date: LocalDate) => {
    setChanging(false)
    void navigate({ to: "/history", search: searchFor(periodOf(period.view, date), today, hidden) })
  }
  return (
    <div className="sticky top-[env(safe-area-inset-top)] z-[5] -mx-4 -mt-3 flex flex-col bg-background px-4 pb-1">
      <nav aria-label={NAMES[period.view]} className="flex items-center justify-between gap-2">
        <Step search={navigation.previous} label={`Previous ${noun}`} Icon={ChevronLeftIcon} />
        <div className="flex min-h-11 flex-col items-center justify-center">
          <h2 className="text-lg font-semibold tabular-nums">{periodTitle(period)}</h2>
          <div className="flex items-center gap-2 text-xs">
            {isCurrent ? (
              <p className="text-muted-foreground">{currentLabel(period.view)}</p>
            ) : (
              <Link to="/history" search={navigation.current} activeOptions={{ exact: true }} className={LINK_TEXT}>
                {backLabel(period.view)}
              </Link>
            )}
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <button type="button" aria-expanded={changing} onClick={() => setChanging(!changing)} className={LINK_TEXT}>
              Change
            </button>
          </div>
        </div>
        <Step search={navigation.next} label={`Next ${noun}`} Icon={ChevronRightIcon} />
      </nav>
      {changing ? <GoToDate shown={firstDateOf(period)} earliest={birthDate} latest={today} onPick={goTo} /> : null}
    </div>
  )
}

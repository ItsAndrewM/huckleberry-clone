import type { LocalDate } from "@bt/contracts"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { buttonVariants } from "../../components/ui/button.tsx"
import { GoToDate } from "./go-to-date.tsx"
import type { HistorySearch } from "./history-date.ts"
import { type Hidden, hiddenNotice } from "./history-kinds.ts"
import { goToOpensOn, type HistoryNavigation, opensAtTop, searchFor } from "./history-navigation.ts"
import { type HistoryUnit, periodKey, periodOf, unitOf } from "./history-period.ts"
import { backLabel, currentLabel, periodTitle } from "./history-titles.ts"

const NAMES = { day: "Days", week: "Weeks" } as const satisfies Record<HistoryUnit, string>

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
      resetScroll={opensAtTop(search)}
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
  const navigate = useNavigate()
  const { period, isCurrent } = navigation
  const key = periodKey(period)
  const [changingFor, setChangingFor] = useState<string | null>(null)
  if (changingFor !== null && changingFor !== key) setChangingFor(null)
  const changing = changingFor === key
  const notice = hiddenNotice(hidden)
  const noun = unitOf(period.view)
  const goTo = (date: LocalDate) => {
    setChangingFor(null)
    const search = searchFor(periodOf(period.view, date), today, hidden)
    void navigate({ to: "/history", search, resetScroll: opensAtTop(search) })
  }
  return (
    <div className="sticky top-[env(safe-area-inset-top)] z-[5] -mx-4 -mt-3 flex flex-col bg-background px-4 pb-1">
      <nav aria-label={NAMES[noun]} className="flex items-center justify-between gap-2">
        <Step search={navigation.previous} label={`Previous ${noun}`} Icon={ChevronLeftIcon} />
        <div className="flex min-h-11 flex-col items-center justify-center">
          <h2 className="text-lg font-semibold tabular-nums">{periodTitle(period)}</h2>
          <div className="flex items-center gap-2 text-xs">
            {isCurrent ? (
              <p className="text-muted-foreground">{currentLabel(period.view)}</p>
            ) : (
              <Link
                to="/history"
                search={navigation.current}
                resetScroll={opensAtTop(navigation.current)}
                activeOptions={{ exact: true }}
                className={LINK_TEXT}
              >
                {backLabel(period.view)}
              </Link>
            )}
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <button
              type="button"
              aria-expanded={changing}
              onClick={() => setChangingFor(changing ? null : key)}
              className={LINK_TEXT}
            >
              Change
            </button>
          </div>
        </div>
        <Step search={navigation.next} label={`Next ${noun}`} Icon={ChevronRightIcon} />
      </nav>
      {notice === undefined ? null : (
        <p className="pointer-events-none text-center text-xs text-muted-foreground">{notice}</p>
      )}
      {changing ? (
        <GoToDate shown={goToOpensOn(period, birthDate)} earliest={birthDate} latest={today} onPick={goTo} />
      ) : null}
    </div>
  )
}

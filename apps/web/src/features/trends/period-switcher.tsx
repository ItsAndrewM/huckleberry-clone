import { Link } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon, type LucideIcon } from "lucide-react"
import { buttonVariants } from "../../components/ui/button.tsx"
import type { TrendsView } from "./trends-period.ts"
import type { TrendsNavigation, TrendsSearch } from "./trends-search.ts"
import { backLabel, currentLabel, periodTitle } from "./trends-titles.ts"

const PERIOD_NAMES = { day: "day", week: "week", month: "month" } as const satisfies Record<TrendsView, string>

interface StepProps {
  readonly search: TrendsSearch | null
  readonly label: string
  readonly Icon: LucideIcon
}

const Step = ({ search, label, Icon }: StepProps) =>
  search === null ? (
    <span aria-hidden="true" className="size-11" />
  ) : (
    <Link
      to="/trends"
      search={search}
      activeOptions={{ exact: true }}
      aria-label={label}
      className={buttonVariants({ variant: "ghost", size: "icon-lg" })}
    >
      <Icon aria-hidden="true" className="size-5" />
    </Link>
  )

export const PeriodSwitcher = ({ navigation }: { readonly navigation: TrendsNavigation }) => {
  const { view } = navigation.period
  return (
    <nav aria-label={`${PERIOD_NAMES[view]}s`} className="flex items-center justify-between gap-2">
      <Step search={navigation.previous} label={`Previous ${PERIOD_NAMES[view]}`} Icon={ChevronLeftIcon} />
      <div className="flex min-h-11 flex-col items-center justify-center">
        <h2 className="text-lg font-semibold tabular-nums">{periodTitle(navigation.period)}</h2>
        {navigation.isCurrent ? (
          <p className="text-xs text-muted-foreground">{currentLabel(view)}</p>
        ) : (
          <Link
            to="/trends"
            search={navigation.current}
            activeOptions={{ exact: true }}
            className="-my-3.5 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {backLabel(view)}
          </Link>
        )}
      </div>
      <Step search={navigation.next} label={`Next ${PERIOD_NAMES[view]}`} Icon={ChevronRightIcon} />
    </nav>
  )
}

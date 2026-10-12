import { Link } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon, type LucideIcon } from "lucide-react"
import { buttonVariants } from "../../components/ui/button.tsx"
import { type DayNavigation, dayTitle, type HistorySearch } from "./history-date.ts"

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

export const DaySwitcher = ({ navigation }: { readonly navigation: DayNavigation }) => (
  <nav aria-label="Days" className="flex items-center justify-between gap-2">
    <Step search={navigation.previous} label="Previous day" Icon={ChevronLeftIcon} />
    <div className="flex min-h-11 flex-col items-center justify-center">
      <h2 className="text-lg font-semibold">{dayTitle(navigation.date)}</h2>
      {navigation.isToday ? (
        <p className="text-xs text-muted-foreground">Today</p>
      ) : (
        <Link
          to="/history"
          search={{}}
          activeOptions={{ exact: true }}
          className="-my-3.5 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to today
        </Link>
      )}
    </div>
    <Step search={navigation.next} label="Next day" Icon={ChevronRightIcon} />
  </nav>
)

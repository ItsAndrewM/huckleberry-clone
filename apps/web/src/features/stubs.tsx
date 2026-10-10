import { CalendarDaysIcon, ChartLineIcon, RulerIcon } from "lucide-react"
import { ComingSoon } from "../shell/coming-soon.tsx"

export const HistoryPage = () => (
  <ComingSoon
    title="History"
    Icon={CalendarDaysIcon}
    description="Every feed, diaper and sleep, day by day and week by week."
  />
)

export const TrendsPage = () => (
  <ComingSoon title="Trends" Icon={ChartLineIcon} description="Charts of feeding, diapers and sleep over time." />
)

export const GrowthPage = () => (
  <ComingSoon title="Growth" Icon={RulerIcon} description="Weight, length and head size, with WHO percentiles." />
)

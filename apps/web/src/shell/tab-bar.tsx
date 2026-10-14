import { Link } from "@tanstack/react-router"
import { CalendarDaysIcon, ChartLineIcon, HouseIcon, RulerIcon, SettingsIcon } from "lucide-react"

const TABS = [
  { to: "/", label: "Today", Icon: HouseIcon, resetScroll: true },
  { to: "/history", label: "History", Icon: CalendarDaysIcon, resetScroll: false },
  { to: "/trends", label: "Trends", Icon: ChartLineIcon, resetScroll: true },
  { to: "/growth", label: "Growth", Icon: RulerIcon, resetScroll: true },
  { to: "/settings", label: "Settings", Icon: SettingsIcon, resetScroll: true },
] as const

export const TabBar = () => (
  <nav
    aria-label="Main"
    className="fixed inset-x-0 bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
  >
    <ul className="mx-auto flex max-w-lg">
      {TABS.map(({ to, label, Icon, resetScroll }) => (
        <li key={to} className="flex-1">
          <Link
            to={to}
            resetScroll={resetScroll}
            activeOptions={{ exact: to === "/", includeSearch: false }}
            className="flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors data-[status=active]:text-primary"
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  </nav>
)

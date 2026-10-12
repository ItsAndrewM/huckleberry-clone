import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { GrowthPage } from "../features/growth/growth-page.tsx"
import { dateInSearch, type HistorySearch } from "../features/history/history-date.ts"
import { HistoryPage } from "../features/history/history-page.tsx"
import { SettingsPage } from "../features/settings/settings-page.tsx"
import { TrendsPage } from "../features/stubs.tsx"
import { TodayPage } from "../features/today/today-page.tsx"
import { NotFoundPage } from "./not-found-page.tsx"
import { Shell } from "./shell.tsx"

const rootRoute = createRootRoute({ component: Shell, notFoundComponent: NotFoundPage })
const getParentRoute = () => rootRoute

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute, path: "/", component: TodayPage }),
  createRoute({
    getParentRoute,
    path: "/history",
    component: HistoryPage,
    validateSearch: (search): HistorySearch => ({ date: dateInSearch(search.date) }),
  }),
  createRoute({ getParentRoute, path: "/trends", component: TrendsPage }),
  createRoute({ getParentRoute, path: "/growth", component: GrowthPage }),
  createRoute({ getParentRoute, path: "/settings", component: SettingsPage }),
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

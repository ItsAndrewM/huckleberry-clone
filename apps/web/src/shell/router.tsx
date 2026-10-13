import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { DeletedPage } from "../features/deleted/deleted-page.tsx"
import { GrowthPage } from "../features/growth/growth-page.tsx"
import { dateInSearch, type HistorySearch } from "../features/history/history-date.ts"
import { HistoryPage } from "../features/history/history-page.tsx"
import { SettingsPage } from "../features/settings/settings-page.tsx"
import { TodayPage } from "../features/today/today-page.tsx"
import { TrendsPage } from "../features/trends/trends-page.tsx"
import { dateInTrends, type TrendsSearch, viewInTrends } from "../features/trends/trends-search.ts"
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
  createRoute({
    getParentRoute,
    path: "/trends",
    component: TrendsPage,
    validateSearch: (search): TrendsSearch => ({ view: viewInTrends(search.view), date: dateInTrends(search.date) }),
  }),
  createRoute({ getParentRoute, path: "/growth", component: GrowthPage }),
  createRoute({ getParentRoute, path: "/settings", component: SettingsPage }),
  createRoute({ getParentRoute, path: "/settings/deleted", component: DeletedPage }),
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

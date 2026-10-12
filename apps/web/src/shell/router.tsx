import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { GrowthPage } from "../features/growth/growth-page.tsx"
import { SettingsPage } from "../features/settings/settings-page.tsx"
import { HistoryPage } from "../features/stubs.tsx"
import { TodayPage } from "../features/today/today-page.tsx"
import { TrendsPage } from "../features/trends/trends-page.tsx"
import { dateInTrends, type TrendsSearch, viewInTrends } from "../features/trends/trends-search.ts"
import { NotFoundPage } from "./not-found-page.tsx"
import { Shell } from "./shell.tsx"

const rootRoute = createRootRoute({ component: Shell, notFoundComponent: NotFoundPage })
const getParentRoute = () => rootRoute

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute, path: "/", component: TodayPage }),
  createRoute({ getParentRoute, path: "/history", component: HistoryPage }),
  createRoute({
    getParentRoute,
    path: "/trends",
    component: TrendsPage,
    validateSearch: (search): TrendsSearch => ({ view: viewInTrends(search.view), date: dateInTrends(search.date) }),
  }),
  createRoute({ getParentRoute, path: "/growth", component: GrowthPage }),
  createRoute({ getParentRoute, path: "/settings", component: SettingsPage }),
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { DeletedPage } from "../features/deleted/deleted-page.tsx"
import { GrowthPage } from "../features/growth/growth-page.tsx"
import { SettingsPage } from "../features/settings/settings-page.tsx"
import { HistoryPage, TrendsPage } from "../features/stubs.tsx"
import { TodayPage } from "../features/today/today-page.tsx"
import { NotFoundPage } from "./not-found-page.tsx"
import { Shell } from "./shell.tsx"

const rootRoute = createRootRoute({ component: Shell, notFoundComponent: NotFoundPage })
const getParentRoute = () => rootRoute

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute, path: "/", component: TodayPage }),
  createRoute({ getParentRoute, path: "/history", component: HistoryPage }),
  createRoute({ getParentRoute, path: "/trends", component: TrendsPage }),
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

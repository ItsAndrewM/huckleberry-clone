import { createContext, use } from "react"
import type { HouseholdApi } from "./api/client.ts"
import type { ConnectivityStore } from "./api/connectivity.ts"

export interface App {
  readonly api: HouseholdApi
  readonly connectivity: ConnectivityStore
}

export const AppContext = createContext<App | null>(null)

export const useApp = () => {
  const app = use(AppContext)
  if (app === null) throw new Error("useApp runs inside <AppContext>")
  return app
}

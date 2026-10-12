import { createContext, use } from "react"
import type { HouseholdApi } from "./api/client.ts"
import type { ConnectivityStore } from "./api/connectivity.ts"
import type { Freshness } from "./api/freshness.ts"
import type { Draft } from "./sheets/drafts.ts"
import type { Restored } from "./sheets/restored.ts"

export interface App {
  readonly api: HouseholdApi
  readonly connectivity: ConnectivityStore
  readonly freshness: Freshness
  readonly draft: Draft | null
  readonly restored: Restored
}

export const AppContext = createContext<App | null>(null)

export const useApp = () => {
  const app = use(AppContext)
  if (app === null) throw new Error("useApp runs inside <AppContext>")
  return app
}

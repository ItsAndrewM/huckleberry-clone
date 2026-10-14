import { Outlet } from "@tanstack/react-router"
import { useMe } from "../api/hooks.ts"
import { useApp } from "../app-context.ts"
import { InstallCard } from "../install/install-card.tsx"
import { SheetsProvider } from "../sheets/sheets-provider.tsx"
import { UndoToast } from "../sheets/undo-toast.tsx"
import { ConnectionBanner } from "./connection-banner.tsx"
import { LogSheets } from "./log-sheets.tsx"
import { NewVersionOnReturn } from "./new-version-on-return.tsx"
import { TabBar } from "./tab-bar.tsx"

export const Shell = () => {
  useMe()
  const { restored } = useApp()
  return (
    <SheetsProvider restored={restored}>
      <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
        <div className="sticky top-0 z-10">
          <ConnectionBanner />
        </div>
        <main className="flex flex-1 flex-col px-4 pt-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          <InstallCard />
          <Outlet />
        </main>
        <TabBar />
      </div>
      <UndoToast />
      <LogSheets />
      <NewVersionOnReturn />
    </SheetsProvider>
  )
}

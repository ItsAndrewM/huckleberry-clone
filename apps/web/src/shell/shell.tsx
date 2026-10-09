import { Outlet } from "@tanstack/react-router"
import { useMe } from "../api/hooks.ts"
import { TabBar } from "./tab-bar.tsx"

export const Shell = () => {
  useMe()
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <main className="flex flex-1 flex-col px-4 pt-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

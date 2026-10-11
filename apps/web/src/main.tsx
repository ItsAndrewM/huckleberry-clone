import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { connectApi } from "./api/client.ts"
import { createConnectivity, followBrowser } from "./api/connectivity.ts"
import { startLive } from "./api/live-connection.ts"
import { socketUrl } from "./api/live.ts"
import { createQueryClient } from "./api/query-client.ts"
import { AppContext } from "./app-context.ts"
import { registerServiceWorker } from "./service-worker/register.ts"
import { takeDraft } from "./sheets/drafts.ts"
import { router } from "./shell/router.tsx"
import "./index.css"

const root = document.getElementById("root")
if (root === null) throw new Error("#root is missing from index.html")

const connectivity = createConnectivity(navigator.onLine)
followBrowser(connectivity, window)
const api = connectApi({ report: connectivity.report })
const queryClient = createQueryClient()
const draft = takeDraft(() => sessionStorage, `${window.location.pathname}${window.location.search}`)
const live = startLive({
  open: () => new WebSocket(socketUrl(window.location)),
  onChanged: (keys) => {
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
  },
  onStale: () => void queryClient.invalidateQueries(),
  report: connectivity.report,
})
window.addEventListener("online", live.wake)
if (import.meta.env.PROD) window.addEventListener("load", () => void registerServiceWorker(navigator.serviceWorker))

createRoot(root).render(
  <StrictMode>
    <AppContext value={{ api, connectivity, draft }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppContext>
  </StrictMode>,
)

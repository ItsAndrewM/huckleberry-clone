import { useLocation } from "@tanstack/react-router"
import { LogInIcon, WifiOffIcon } from "lucide-react"
import { useSyncExternalStore } from "react"
import { useConnectivity, useMe } from "../api/hooks.ts"
import { useApp } from "../app-context.ts"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../components/ui/alert.tsx"
import { buttonVariants } from "../components/ui/button.tsx"
import { useMinute } from "../timer/use-now.ts"
import { signInUrl } from "./sign-in.ts"
import { phoneZone, updatedLine } from "./updated.ts"

const CANT_SAVE = "Entries can't be saved or refreshed until you're back online."

const OfflineBanner = ({ updatedAt, zone }: { readonly updatedAt: number | null; readonly zone: string }) => {
  const now = useMinute()
  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-muted px-4 text-muted-foreground">
      <WifiOffIcon aria-hidden="true" />
      <AlertTitle>No connection</AlertTitle>
      <AlertDescription>
        {updatedAt === null ? CANT_SAVE : `${CANT_SAVE} ${updatedLine(updatedAt, now, zone)}`}
      </AlertDescription>
    </Alert>
  )
}

const SignInBanner = () => {
  const href = useLocation({ select: ({ pathname, searchStr }) => signInUrl({ pathname, search: searchStr }) })
  return (
    <Alert className="rounded-none border-x-0 border-t-0 px-4 py-3">
      <LogInIcon aria-hidden="true" />
      <AlertTitle>Sign in to continue</AlertTitle>
      <AlertDescription>Your sign-in has expired.</AlertDescription>
      <AlertAction className="top-1/2 right-4 -translate-y-1/2">
        <a href={href} className={buttonVariants({ size: "lg" })}>
          Sign in
        </a>
      </AlertAction>
    </Alert>
  )
}

const useUpdatedAt = () => {
  const { freshness } = useApp()
  return useSyncExternalStore(freshness.subscribe, freshness.updatedAt)
}

export const ConnectionBanner = () => {
  const connectivity = useConnectivity()
  const updatedAt = useUpdatedAt()
  const { data: me } = useMe()
  if (connectivity === "offline")
    return <OfflineBanner updatedAt={updatedAt} zone={me?.household.timeZone ?? phoneZone()} />
  if (connectivity === "auth-required") return <SignInBanner />
  return null
}

import { useLocation } from "@tanstack/react-router"
import { LogInIcon, WifiOffIcon } from "lucide-react"
import { useConnectivity } from "../api/hooks.ts"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../components/ui/alert.tsx"
import { buttonVariants } from "../components/ui/button.tsx"
import { signInUrl } from "./sign-in.ts"

const OfflineBanner = () => (
  <Alert className="rounded-none border-x-0 border-t-0 bg-muted px-4 text-muted-foreground">
    <WifiOffIcon aria-hidden="true" />
    <AlertTitle>No connection</AlertTitle>
    <AlertDescription>Entries can't be saved or refreshed until you're back online.</AlertDescription>
  </Alert>
)

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

export const ConnectionBanner = () => {
  const connectivity = useConnectivity()
  if (connectivity === "offline") return <OfflineBanner />
  if (connectivity === "auth-required") return <SignInBanner />
  return null
}

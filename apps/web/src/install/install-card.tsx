import { useState } from "react"
import { Button } from "../components/ui/button.tsx"
import { focusPageHeading } from "../shell/page-heading.ts"
import { dismissInstallCard, installCardDismissed, showsInstallCard } from "./home-screen.ts"
import { ShareSteps } from "./share-steps.tsx"
import { phoneStorage, thisPhone } from "./this-phone.ts"

export const InstallCard = () => {
  const [shown, setShown] = useState(() => showsInstallCard(thisPhone, installCardDismissed(phoneStorage)))
  if (!shown) return null
  const notNow = () => {
    dismissInstallCard(phoneStorage)
    setShown(false)
    focusPageHeading()
  }
  return (
    <section
      aria-labelledby="install-card-title"
      className="mb-6 flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <p id="install-card-title" className="font-medium">
        Install Baby tracker
      </p>
      <p className="text-sm text-muted-foreground">
        <ShareSteps />
      </p>
      <Button variant="ghost" size="lg" className="self-end" onClick={notNow}>
        Not now
      </Button>
    </section>
  )
}

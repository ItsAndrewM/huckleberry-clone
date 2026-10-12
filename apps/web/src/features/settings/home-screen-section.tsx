import { ShareSteps } from "../../install/share-steps.tsx"
import { thisPhone } from "../../install/this-phone.ts"
import { SettingsSection } from "./settings-section.tsx"

const HomeScreenStatus = () =>
  thisPhone === "installed" ? (
    "Installed."
  ) : (
    <>
      In a browser tab. <ShareSteps />
    </>
  )

export const HomeScreenSection = () =>
  thisPhone === "elsewhere" ? null : (
    <SettingsSection titleId="home-screen-label" title="Home Screen">
      <p className="text-base">
        <HomeScreenStatus />
      </p>
    </SettingsSection>
  )

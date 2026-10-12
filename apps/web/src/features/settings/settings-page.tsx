import { useMe } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { AccountSection } from "./account-section.tsx"
import { ChildSection } from "./child-section.tsx"
import { ExportSection } from "./export-section.tsx"
import { HomeScreenSection } from "./home-screen-section.tsx"
import { OfflineCopySection } from "./offline-copy-section.tsx"
import { SettingsSection } from "./settings-section.tsx"
import { ThemePicker } from "./theme-picker.tsx"
import { TimeZoneSection } from "./time-zone-section.tsx"
import { UnitsSection } from "./units-section.tsx"

export const SettingsPage = () => {
  const meQuery = useMe()
  const { data: me } = meQuery
  return (
    <Page title="Settings">
      <SettingsSection titleId="theme-label" title="Theme">
        <ThemePicker />
      </SettingsSection>
      {me === undefined ? (
        <NotLoaded
          failed={meQuery.isError}
          message="The household's settings couldn't be loaded."
          retry={retryOf(meQuery)}
        />
      ) : (
        <>
          <UnitsSection household={me.household} />
          <TimeZoneSection household={me.household} />
          <ChildSection child={me.child} />
          <AccountSection caregiver={me.caregiver} />
          <ExportSection timeZone={me.household.timeZone} />
        </>
      )}
      <OfflineCopySection />
      <HomeScreenSection />
    </Page>
  )
}

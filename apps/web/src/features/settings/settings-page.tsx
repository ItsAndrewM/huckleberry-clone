import { useMe } from "../../api/hooks.ts"
import { Page } from "../../shell/page.tsx"
import { SettingsSection } from "./settings-section.tsx"
import { ThemePicker } from "./theme-picker.tsx"
import { TimeZoneSection } from "./time-zone-section.tsx"
import { UnitsSection } from "./units-section.tsx"

export const SettingsPage = () => {
  const { data: me } = useMe()
  return (
    <Page title="Settings">
      <SettingsSection titleId="theme-label" title="Theme">
        <ThemePicker />
      </SettingsSection>
      {me === undefined ? null : (
        <>
          <UnitsSection household={me.household} />
          <TimeZoneSection household={me.household} />
        </>
      )}
    </Page>
  )
}

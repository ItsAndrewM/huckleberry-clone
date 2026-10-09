import { Page } from "../../shell/page.tsx"
import { ThemePicker } from "./theme-picker.tsx"

export const SettingsPage = () => (
  <Page title="Settings">
    <section className="flex flex-col gap-3">
      <h2 id="theme-label" className="text-sm font-medium text-muted-foreground">
        Theme
      </h2>
      <ThemePicker />
    </section>
  </Page>
)

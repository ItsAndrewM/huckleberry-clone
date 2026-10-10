import type { Caregiver } from "@bt/contracts"
import { SettingsSection } from "./settings-section.tsx"

export const AccountSection = ({ caregiver }: { readonly caregiver: Caregiver }) => (
  <SettingsSection titleId="account-label" title="Signed in as">
    <div className="flex flex-col gap-0.5">
      <p className="text-base font-medium">{caregiver.displayName}</p>
      <p className="text-sm text-muted-foreground">{caregiver.email}</p>
    </div>
  </SettingsSection>
)

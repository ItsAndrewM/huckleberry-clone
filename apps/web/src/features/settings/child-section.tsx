import type { Child } from "@bt/contracts"
import { useSaveChild } from "../../api/hooks.ts"
import { ChildForm } from "./child-form.tsx"
import { SettingsSection } from "./settings-section.tsx"

export const ChildSection = ({ child }: { readonly child: Child }) => {
  const save = useSaveChild()
  return (
    <SettingsSection titleId="child-label" title="Child">
      <ChildForm key={child.version} child={child} save={save} />
    </SettingsSection>
  )
}

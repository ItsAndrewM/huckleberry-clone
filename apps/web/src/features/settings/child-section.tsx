import type { Child } from "@bt/contracts"
import { useState } from "react"
import { useSaveChild } from "../../api/hooks.ts"
import { focusFollowsSwap } from "../../shell/focus-hand-off.ts"
import { ChildForm } from "./child-form.tsx"
import { SettingsSection } from "./settings-section.tsx"

export const ChildSection = ({ child }: { readonly child: Child }) => {
  const save = useSaveChild()
  const [savesFocus] = useState(focusFollowsSwap)
  return (
    <SettingsSection titleId="child-label" title="Child">
      <ChildForm key={child.version} child={child} save={save} saveRef={savesFocus} />
    </SettingsSection>
  )
}

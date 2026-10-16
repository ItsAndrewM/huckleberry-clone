import type { Child } from "@bt/contracts"
import { useState } from "react"
import { useSaveChild } from "../../api/hooks.ts"
import { focusFollowsSwap } from "../../shell/focus-hand-off.ts"
import { ChildForm } from "./child-form.tsx"
import { SettingsSection } from "./settings-section.tsx"

export const ChildSection = ({ child }: { readonly child: Child }) => {
  const save = useSaveChild()
  const [savesFocus] = useState(focusFollowsSwap)
  const [editedOn, setEditedOn] = useState<number | null>(null)
  const edited = editedOn === child.version
  const saved = !edited && save.data?.child.version === child.version
  return (
    <SettingsSection titleId="child-label" title="Child">
      <ChildForm
        key={child.version}
        child={child}
        save={save}
        saveRef={savesFocus}
        edited={edited}
        saved={saved}
        onEdit={() => setEditedOn(child.version)}
      />
      <output className="sr-only">{saved ? "Saved" : ""}</output>
    </SettingsSection>
  )
}

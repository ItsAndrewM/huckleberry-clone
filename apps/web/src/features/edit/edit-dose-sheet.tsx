import { useState } from "react"
import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { displayOf } from "../today/display.ts"
import { EditDoseForm } from "./edit-dose-form.tsx"
import { useCachedEntry } from "./use-cached-entry.ts"

const EditDoseContent = () => {
  const sheets = useSheets()
  const { data: me } = useMe()
  const cached = useCachedEntry(sheets.editing)
  const [shown, setShown] = useState({ entry: cached, taken: 0 })
  if (me === undefined) return null
  if (shown.entry?.kind !== "dose") return <p className="text-sm text-muted-foreground">This dose was deleted.</p>
  return (
    <EditDoseForm
      key={shown.taken}
      dose={shown.entry.dose}
      display={displayOf(me.household)}
      onUseTheirs={(entry) => setShown(({ taken }) => ({ entry, taken: taken + 1 }))}
    />
  )
}

export const EditDoseSheet = () => (
  <Sheet sheet="editDose" title="Edit dose">
    <EditDoseContent />
  </Sheet>
)

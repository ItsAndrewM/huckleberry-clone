import { useState } from "react"
import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { useCachedEntry } from "../edit/use-cached-entry.ts"
import { displayOf } from "../today/display.ts"
import { EditSleepForm } from "./edit-sleep-form.tsx"

const EditSleepContent = () => {
  const sheets = useSheets()
  const { data: me } = useMe()
  const cached = useCachedEntry(sheets.editing)
  const [shown, setShown] = useState({ entry: cached, taken: 0 })
  if (me === undefined) return null
  if (shown.entry?.kind !== "sleep") return <p className="text-sm text-muted-foreground">This sleep was deleted.</p>
  return (
    <EditSleepForm
      key={shown.taken}
      sleep={shown.entry.sleep}
      display={displayOf(me.household)}
      onUseTheirs={(entry) => setShown(({ taken }) => ({ entry, taken: taken + 1 }))}
    />
  )
}

export const EditSleepSheet = () => (
  <Sheet sheet="editSleep" title="Edit sleep">
    <EditSleepContent />
  </Sheet>
)

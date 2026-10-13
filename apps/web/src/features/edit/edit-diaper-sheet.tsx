import { useState } from "react"
import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { displayOf } from "../today/display.ts"
import { EditDiaperForm } from "./edit-diaper-form.tsx"
import { useCachedEntry } from "./use-cached-entry.ts"

const EditDiaperContent = () => {
  const sheets = useSheets()
  const { data: me } = useMe()
  const cached = useCachedEntry(sheets.editing)
  const [shown, setShown] = useState(cached)
  if (me === undefined) return null
  if (shown?.kind !== "diaper") return <p className="text-sm text-muted-foreground">This diaper was deleted.</p>
  return (
    <EditDiaperForm
      key={shown.diaper.version}
      diaper={shown.diaper}
      display={displayOf(me.household)}
      onUseTheirs={setShown}
    />
  )
}

export const EditDiaperSheet = () => (
  <Sheet sheet="editDiaper" title="Edit diaper">
    <EditDiaperContent />
  </Sheet>
)

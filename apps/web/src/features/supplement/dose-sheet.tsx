import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { useHousehold } from "../../sheets/use-household.ts"
import { DoseForm } from "./dose-form.tsx"
import { supplementIdOf } from "./dose-session.ts"

export const DoseSheet = () => {
  const sheets = useSheets()
  const household = useHousehold()
  const { data: me } = useMe()
  const id = supplementIdOf(failedFor(sheets, "dose"), sheets.editing)
  const supplement = me?.household.supplements.find((one) => one.id === id)
  return (
    <Sheet sheet="dose" title={supplement?.name ?? "Supplement"} description="One tap saves it.">
      {household === null || supplement === undefined ? null : (
        <DoseForm household={household} supplement={supplement} />
      )}
    </Sheet>
  )
}

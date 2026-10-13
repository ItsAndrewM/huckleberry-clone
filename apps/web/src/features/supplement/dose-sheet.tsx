import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { useHousehold } from "../../sheets/use-household.ts"
import { DoseForm } from "./dose-form.tsx"
import { formKeyOf, supplementIdOf } from "./dose-session.ts"

export const DoseSheet = () => {
  const sheets = useSheets()
  const household = useHousehold()
  const { data: me } = useMe()
  const failed = failedFor(sheets, "dose")
  const id = supplementIdOf(failed, sheets.editing)
  const supplement = me?.household.supplements.find((one) => one.id === id)
  return (
    <Sheet sheet="dose" title={supplement?.name ?? "Supplement"} description="One tap saves it.">
      {household === null || supplement === undefined ? null : (
        <DoseForm key={formKeyOf(failed)} household={household} supplement={supplement} />
      )}
    </Sheet>
  )
}

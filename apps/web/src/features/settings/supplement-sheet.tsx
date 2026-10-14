import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { SupplementForm } from "./supplement-form.tsx"

export const SupplementSheet = () => {
  const sheets = useSheets()
  const { data: me } = useMe()
  const shown = me?.household.supplements.find(({ id }) => id === sheets.editing) ?? null
  return (
    <Sheet sheet="supplement" title={shown === null ? "Add a supplement" : shown.name}>
      {me === undefined ? null : <SupplementForm key={shown?.version} shown={shown} />}
    </Sheet>
  )
}

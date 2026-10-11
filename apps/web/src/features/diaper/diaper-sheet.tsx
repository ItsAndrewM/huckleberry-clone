import { Sheet } from "../../sheets/sheet.tsx"
import { useHousehold } from "../../sheets/use-household.ts"
import { DiaperForm } from "./diaper-form.tsx"

export const DiaperSheet = () => {
  const household = useHousehold()
  return (
    <Sheet sheet="diaper" title="Diaper" description="One tap saves it.">
      {household === null ? null : <DiaperForm household={household} />}
    </Sheet>
  )
}

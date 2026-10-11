import { PlusIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"

export const AddMeasurement = ({ ready }: { readonly ready: boolean }) => {
  const sheets = useSheets()
  return (
    <Button variant="outline" size="lg" disabled={!ready} onClick={() => sheets.show("measurement")}>
      <PlusIcon aria-hidden="true" />
      Add<span className="sr-only"> measurement</span>
    </Button>
  )
}

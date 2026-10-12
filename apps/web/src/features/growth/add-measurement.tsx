import { PlusIcon } from "lucide-react"
import { useId } from "react"
import { Button } from "../../components/ui/button.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"

export const AddMeasurement = ({ ready }: { readonly ready: boolean }) => {
  const sheets = useSheets()
  const waitsId = useId()
  return (
    <>
      <Button
        variant="outline"
        size="lg"
        disabled={!ready}
        aria-describedby={ready ? undefined : waitsId}
        onClick={() => sheets.show("measurement")}
      >
        <PlusIcon aria-hidden="true" />
        Add<span className="sr-only"> measurement</span>
      </Button>
      {ready ? null : (
        <span id={waitsId} className="sr-only">
          Adding opens once Growth loads.
        </span>
      )}
    </>
  )
}

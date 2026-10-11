import { Button } from "../components/ui/button.tsx"
import { failureNote } from "./failure.ts"
import type { SheetKind } from "./sending.ts"
import { failedFor, useSheets } from "./sheets-context.ts"
import { useHousehold } from "./use-household.ts"

export const FailureNote = ({ sheet }: { readonly sheet: SheetKind }) => {
  const sheets = useSheets()
  const household = useHousehold()
  const failed = failedFor(sheets, sheet)
  if (failed === null || household === null) return null
  const { message, retry } = failureNote(failed.error, household)
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <p>{message}</p>
      {retry === null ? null : (
        <Button variant="outline" size="lg" onClick={() => sheets.send(failed.sending)}>
          {retry}
        </Button>
      )}
    </div>
  )
}

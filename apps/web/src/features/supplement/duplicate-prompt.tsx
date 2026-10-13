import { Button } from "../../components/ui/button.tsx"
import type { Household } from "../../sheets/failure.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { type Duplicate, duplicateMessage } from "./dose-session.ts"

interface DuplicatePromptProps {
  readonly duplicate: Duplicate
  readonly name: string
  readonly household: Household
}

export const DuplicatePrompt = ({ duplicate, name, household }: DuplicatePromptProps) => {
  const sheets = useSheets()
  const recordAnyway = () => {
    sheets.discard(duplicate.failed)
    sheets.send(duplicate.resend())
  }
  const dontRecord = () => {
    sheets.discard(duplicate.failed)
    sheets.close()
  }
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-base">{duplicateMessage(name, duplicate.current, household)}</p>
      <Button size="lg" onClick={recordAnyway}>
        Record another dose
      </Button>
      <Button variant="ghost" size="lg" onClick={dontRecord}>
        Don't record it
      </Button>
    </div>
  )
}

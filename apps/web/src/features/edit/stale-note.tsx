import type { RecentEntry } from "@bt/contracts"
import { recordOf } from "../../api/today-change.ts"
import { Button } from "../../components/ui/button.tsx"
import type { Failed } from "../../sheets/sending.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { useNow } from "../../timer/use-now.ts"
import type { Display } from "../today/display.ts"
import { type Stale, sentAnyway, staleMessage, whoChanged } from "./stale.ts"

interface StaleNoteProps {
  readonly failed: Failed
  readonly stale: Stale
  readonly display: Display
  readonly onUseTheirs: (current: RecentEntry) => void
}

export const StaleNote = ({ failed, stale, display, onUseTheirs }: StaleNoteProps) => {
  const sheets = useSheets()
  const now = useNow()
  const gone = recordOf(stale.current).deletedAt !== null
  const resend = () => {
    sheets.discard(failed)
    sheets.send(sentAnyway(failed.sending, stale.current))
  }
  const useTheirs = () => {
    sheets.discard(failed)
    onUseTheirs(stale.current)
  }
  const leave = () => {
    sheets.discard(failed)
    sheets.close()
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <p>{staleMessage(display, stale, now)}</p>
      {gone ? (
        <Button variant="outline" size="lg" onClick={leave}>
          OK
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={resend}>
            {stale.deleting ? "Delete anyway" : "Save mine anyway"}
          </Button>
          <Button variant="ghost" size="lg" className="flex-1" onClick={useTheirs}>
            {stale.deleting ? "Keep it" : `Use ${whoChanged(display, stale.current)}'s`}
          </Button>
        </div>
      )}
    </div>
  )
}

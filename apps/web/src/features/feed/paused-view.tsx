import type { Feed, Side } from "@bt/contracts"
import type { FeedAction } from "../../api/actions.ts"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { retapped } from "../../sheets/retap.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { useNow } from "../../timer/use-now.ts"
import { FeedStart } from "./feed-start.tsx"
import { FeedTimer } from "./feed-timer.tsx"
import { controlsWait, deleteAction, finishAction, resumeAction } from "./nursing-state.ts"
import { SidePicker } from "./side-picker.tsx"

interface PausedViewProps {
  readonly feed: Feed
  readonly lastSide: Side | null
  readonly zone: string
}

export const PausedView = ({ feed, lastSide, zone }: PausedViewProps) => {
  const sheets = useSheets()
  const now = useNow()
  const busy = controlsWait(sheets.busy, feed)
  const act = (action: FeedAction) => sheets.send(retapped(sheets.held, { sheet: "nursing", action }))
  return (
    <>
      <FailureNote sheet="nursing" />
      <FeedTimer feed={feed} now={now} status="Paused" running={false} />
      <FeedStart feed={feed} zone={zone} busy={busy} />
      <SidePicker
        label="Resume on"
        lastSide={lastSide}
        disabled={busy}
        onPick={(side) => act(resumeAction(feed, side, tapTime()))}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => sheets.show("bottle")}>
          Add bottle
        </Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => act(finishAction(feed, tapTime(), false))}>
          Finish
        </Button>
      </div>
      <DeleteEntry noun="feed" emptied={null} disabled={busy} onDelete={() => act(deleteAction(feed))} />
    </>
  )
}

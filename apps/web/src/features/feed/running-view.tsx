import type { Feed, NursingSegment } from "@bt/contracts"
import type { FeedAction } from "../../api/actions.ts"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { retapped } from "../../sheets/retap.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { OTHER_SIDE, SIDE_NAMES } from "../../sides.ts"
import { useNow } from "../../timer/use-now.ts"
import { FeedStart } from "./feed-start.tsx"
import { FeedTimer } from "./feed-timer.tsx"
import { controlsWait, deleteAction, pauseAction, switchAction } from "./nursing-state.ts"

interface RunningViewProps {
  readonly feed: Feed
  readonly segment: NursingSegment
  readonly zone: string
  readonly onFinish: () => void
}

export const RunningView = ({ feed, segment, zone, onFinish }: RunningViewProps) => {
  const sheets = useSheets()
  const now = useNow()
  const busy = controlsWait(sheets.busy, feed)
  const act = (action: FeedAction) => sheets.send(retapped(sheets.held, { sheet: "nursing", action }))
  return (
    <>
      <FailureNote sheet="nursing" />
      <FeedTimer feed={feed} now={now} status={`${SIDE_NAMES[segment.side]} side`} running />
      <FeedStart feed={feed} zone={zone} busy={busy} />
      <Button
        size="lg"
        className="h-14 text-lg"
        disabled={busy}
        onClick={() => act(switchAction(feed, segment.side, tapTime()))}
      >
        Switch to {SIDE_NAMES[OTHER_SIDE[segment.side]]}
      </Button>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => act(pauseAction(feed, tapTime()))}>
          Pause
        </Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => sheets.show("bottle")}>
          Add bottle
        </Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={onFinish}>
          Finish
        </Button>
      </div>
      <DeleteEntry noun="feed" emptied={null} disabled={busy} onDelete={() => act(deleteAction(feed))} />
    </>
  )
}

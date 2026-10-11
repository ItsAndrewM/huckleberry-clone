import type { Feed, NursingSegment } from "@bt/contracts"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { OTHER_SIDE, SIDE_NAMES } from "../../sides.ts"
import { useNow } from "../../timer/use-now.ts"
import { FeedTimer } from "./feed-timer.tsx"
import { controlsWait, timedAction } from "./nursing-state.ts"

interface RunningViewProps {
  readonly feed: Feed
  readonly segment: NursingSegment
  readonly onFinish: () => void
}

export const RunningView = ({ feed, segment, onFinish }: RunningViewProps) => {
  const sheets = useSheets()
  const now = useNow()
  const busy = controlsWait(sheets.busy, feed)
  const act = (kind: "switchSide" | "pauseFeed") =>
    sheets.send({ sheet: "nursing", action: timedAction(kind, feed, tapTime()) })
  return (
    <>
      <FeedTimer feed={feed} now={now} status={`${SIDE_NAMES[segment.side]} side`} running />
      <Button size="lg" className="h-14 text-lg" disabled={busy} onClick={() => act("switchSide")}>
        Switch to {SIDE_NAMES[OTHER_SIDE[segment.side]]}
      </Button>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => act("pauseFeed")}>
          Pause
        </Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => sheets.show("bottle")}>
          Add bottle
        </Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={onFinish}>
          Finish
        </Button>
      </div>
      <FailureNote sheet="nursing" />
    </>
  )
}

import { type Feed, FeedConflict, type NursingSegment } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import type { Failed } from "../../sheets/sending.ts"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { NOW, resolveWhen, type When, whenAt } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { controlsWait, finishAction } from "./nursing-state.ts"

interface FinishViewProps {
  readonly feed: Feed
  readonly segment: NursingSegment
  readonly zone: string
  readonly onBack: () => void
}

const sentStop = (failed: Failed | null, zone: string): When => {
  const action = failed?.sending.action
  return action?.kind === "finishFeed" ? whenAt(action.payload.occurredAt, zone) : NOW
}

const emptiedBy = (failed: Failed | null) => {
  const action = failed?.sending.action
  if (!(failed?.error instanceof FeedConflict) || failed.error.code !== "FEED_EMPTY") return null
  return action?.kind === "finishFeed" ? { current: failed.error.current, stoppedAt: action.payload.occurredAt } : null
}

export const FinishView = ({ feed, segment, zone, onBack }: FinishViewProps) => {
  const sheets = useSheets()
  const failed = failedFor(sheets, "nursing")
  const [when, setWhen] = useState(() => sentStop(failed, zone))
  const now = useNow()
  const emptied = emptiedBy(failed)
  if (emptied !== null) {
    return (
      <div role="alert" className="flex flex-col gap-3">
        <p className="text-base">Stopping at the start leaves nothing in this feed. Delete it?</p>
        <Button
          variant="destructive"
          size="lg"
          onClick={() =>
            sheets.send({ sheet: "nursing", action: finishAction(emptied.current, emptied.stoppedAt, true) })
          }
        >
          Delete feed
        </Button>
        <Button variant="ghost" size="lg" onClick={onBack}>
          Keep it
        </Button>
      </div>
    )
  }
  const finish = () => {
    const resolved = resolveWhen(when, zone, tapTime(), segment.startedAt)
    if (resolved.ok) sheets.send({ sheet: "nursing", action: finishAction(feed, resolved.instant, false) })
  }
  return (
    <>
      <WhenField label="Stopped" when={when} onChange={setWhen} zone={zone} now={now} earliest={segment.startedAt} />
      <Button
        size="lg"
        className="h-14 text-lg"
        disabled={!resolveWhen(when, zone, now, segment.startedAt).ok || controlsWait(sheets.busy, feed)}
        onClick={finish}
      >
        Finish feed
      </Button>
      <Button variant="ghost" size="lg" onClick={onBack}>
        Back
      </Button>
      <FailureNote sheet="nursing" />
    </>
  )
}

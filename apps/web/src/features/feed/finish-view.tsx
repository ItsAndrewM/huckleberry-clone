import type { Feed, NursingSegment } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { DiscardPrompt } from "../../sheets/discard-prompt.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { heldAs } from "../../sheets/retap.ts"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { useNow } from "../../timer/use-now.ts"
import { backAsksFirst, emptiedBy, finishLetGo, stoppedAtOf, stopSession } from "./nursing-session.ts"
import { controlsWait, finishAction } from "./nursing-state.ts"

interface FinishViewProps {
  readonly feed: Feed
  readonly segment: NursingSegment
  readonly zone: string
  readonly onBack: () => void
}

export const FinishView = ({ feed, segment, zone, onBack }: FinishViewProps) => {
  const sheets = useSheets()
  const failed = failedFor(sheets, "nursing")
  const held = heldAs(sheets.held, "finishFeed", feed.id)
  const [session, setSession] = useState(() => stopSession(held, feed.id, zone))
  const [when, setWhen] = useState(session.when)
  const [askingBack, setAskingBack] = useState(false)
  const now = useNow()
  if (finishLetGo(session, held, sheets)) {
    const fresh = stopSession(null, feed.id, zone)
    setSession(fresh)
    setWhen(fresh.when)
  }
  const emptied = emptiedBy(failed)
  if (emptied !== null) {
    const deleteFeed = () => {
      sheets.discard(emptied.failed)
      sheets.send({ sheet: "nursing", action: finishAction(emptied.current, emptied.stoppedAt, true) })
    }
    const keepFeed = () => {
      sheets.discard(emptied.failed)
      onBack()
    }
    return (
      <div role="alert" className="flex flex-col gap-3">
        <p className="text-base">Stopping at the start leaves nothing in this feed. Delete it?</p>
        <Button variant="destructive" size="lg" disabled={controlsWait(sheets.busy, feed)} onClick={deleteFeed}>
          Delete feed
        </Button>
        <Button variant="ghost" size="lg" onClick={keepFeed}>
          Keep it
        </Button>
      </div>
    )
  }
  if (askingBack && failed !== null) {
    return <DiscardPrompt failed={failed} onDiscard={onBack} onKeep={() => setAskingBack(false)} />
  }
  const finish = () => {
    const resolved = stoppedAtOf(session, when, zone, tapTime(), segment.startedAt)
    if (resolved.ok)
      sheets.send({ sheet: "nursing", action: finishAction(feed, resolved.instant, false, session.actionId) })
  }
  const back = () => {
    if (backAsksFirst(failed)) setAskingBack(true)
    else onBack()
  }
  return (
    <>
      <WhenField label="Stopped" when={when} onChange={setWhen} zone={zone} now={now} earliest={segment.startedAt} />
      <Button
        size="lg"
        className="h-14 text-lg"
        disabled={!stoppedAtOf(session, when, zone, now, segment.startedAt).ok || controlsWait(sheets.busy, feed)}
        onClick={finish}
      >
        Finish feed
      </Button>
      <Button variant="ghost" size="lg" onClick={back}>
        Back
      </Button>
      <FailureNote sheet="nursing" />
    </>
  )
}

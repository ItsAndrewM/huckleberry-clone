import type { Feed, Side } from "@bt/contracts"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { useNow } from "../../timer/use-now.ts"
import { FeedTimer } from "./feed-timer.tsx"
import { controlsWait, finishAction, resumeAction } from "./nursing-state.ts"
import { SidePicker } from "./side-picker.tsx"

interface PausedViewProps {
  readonly feed: Feed
  readonly lastSide: Side | null
}

export const PausedView = ({ feed, lastSide }: PausedViewProps) => {
  const sheets = useSheets()
  const now = useNow()
  const busy = controlsWait(sheets.busy, feed)
  return (
    <>
      <FeedTimer feed={feed} now={now} status="Paused" running={false} />
      <SidePicker
        label="Resume on"
        lastSide={lastSide}
        disabled={busy}
        onPick={(side) => sheets.send({ sheet: "nursing", action: resumeAction(feed, side, tapTime()) })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => sheets.show("bottle")}>
          Add bottle
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={busy}
          onClick={() => sheets.send({ sheet: "nursing", action: finishAction(feed, tapTime(), false) })}
        >
          Finish
        </Button>
      </div>
      <FailureNote sheet="nursing" />
    </>
  )
}

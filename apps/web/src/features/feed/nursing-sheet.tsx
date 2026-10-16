import type { Side } from "@bt/contracts"
import { useState } from "react"
import { useMe, useToday } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { focusFollowsSwap } from "../../shell/focus-hand-off.ts"
import { FinishView } from "./finish-view.tsx"
import { finishingAfter } from "./nursing-session.ts"
import { type NursingState, nursingState } from "./nursing-state.ts"
import { PausedView } from "./paused-view.tsx"
import { RunningView } from "./running-view.tsx"
import { StartView } from "./start-view.tsx"

interface NursingViewProps {
  readonly state: NursingState
  readonly lastSide: Side | null
  readonly zone: string
  readonly finishing: boolean
  readonly onFinish: () => void
  readonly onBack: () => void
}

const NursingView = ({ state, lastSide, zone, finishing, onFinish, onBack }: NursingViewProps) => {
  switch (state.kind) {
    case "idle":
      return <StartView lastSide={lastSide} zone={zone} />
    case "starting":
      return <output className="text-muted-foreground">Starting the feed…</output>
    case "paused":
      return <PausedView feed={state.feed} lastSide={state.lastSide} zone={zone} />
    case "running":
      return finishing ? (
        <FinishView feed={state.feed} segment={state.segment} zone={zone} onBack={onBack} />
      ) : (
        <RunningView feed={state.feed} segment={state.segment} zone={zone} onFinish={onFinish} />
      )
  }
}

const viewOf = (state: NursingState, finishing: boolean) =>
  state.kind === "running" && finishing ? "finishing" : state.kind

const NursingContent = () => {
  const sheets = useSheets()
  const { data: me } = useMe()
  const { data: today } = useToday()
  const [finishing, setFinishing] = useState(() => finishingAfter(failedFor(sheets, "nursing")))
  const [followsSwap] = useState(focusFollowsSwap)
  const back = () => {
    const held = failedFor(sheets, "nursing")
    if (finishingAfter(held)) sheets.discard(held)
    setFinishing(false)
  }
  if (me === undefined || today === undefined) return null
  const state = nursingState(today.activeFeed)
  return (
    <div key={viewOf(state, finishing)} ref={followsSwap} className="contents">
      <NursingView
        state={state}
        lastSide={today.prefill.lastSide}
        zone={me.household.timeZone}
        finishing={finishing}
        onFinish={() => setFinishing(true)}
        onBack={back}
      />
    </div>
  )
}

export const NursingSheet = () => (
  <Sheet sheet="nursing" title="Nursing">
    <NursingContent />
  </Sheet>
)

import { useState } from "react"
import { useMe, useToday } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { FinishView } from "./finish-view.tsx"
import { nursingState } from "./nursing-state.ts"
import { PausedView } from "./paused-view.tsx"
import { RunningView } from "./running-view.tsx"
import { StartView } from "./start-view.tsx"

const NursingContent = () => {
  const sheets = useSheets()
  const { data: me } = useMe()
  const { data: today } = useToday()
  const [finishing, setFinishing] = useState(() => failedFor(sheets, "nursing")?.sending.action.kind === "finishFeed")
  if (me === undefined || today === undefined) return null
  const zone = me.household.timeZone
  const state = nursingState(today.activeFeed)
  switch (state.kind) {
    case "idle":
      return <StartView lastSide={today.prefill.lastSide} zone={zone} />
    case "starting":
      return <output className="text-muted-foreground">Starting the feed…</output>
    case "paused":
      return <PausedView feed={state.feed} lastSide={state.lastSide} />
    case "running":
      return finishing ? (
        <FinishView
          feed={state.feed}
          segment={state.segment}
          zone={zone}
          onBack={() => {
            setFinishing(false)
            sheets.show("nursing")
          }}
        />
      ) : (
        <RunningView feed={state.feed} segment={state.segment} onFinish={() => setFinishing(true)} />
      )
  }
}

export const NursingSheet = () => (
  <Sheet sheet="nursing" title="Nursing">
    <NursingContent />
  </Sheet>
)

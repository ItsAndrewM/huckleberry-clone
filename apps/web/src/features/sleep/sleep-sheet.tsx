import { useMe, useToday } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { RunningSleepView } from "./running-sleep-view.tsx"
import { sleepState } from "./sleep-state.ts"
import { StartSleepView } from "./start-sleep-view.tsx"

const SleepContent = () => {
  const { data: me } = useMe()
  const { data: today } = useToday()
  if (me === undefined || today === undefined) return null
  const zone = me.household.timeZone
  const state = sleepState(today.activeSleep)
  switch (state.kind) {
    case "idle":
      return <StartSleepView zone={zone} />
    case "starting":
      return <output className="text-muted-foreground">Starting the sleep…</output>
    case "running":
      return <RunningSleepView key={state.sleep.id} sleep={state.sleep} zone={zone} />
  }
}

export const SleepSheet = () => (
  <Sheet sheet="sleep" title="Sleep">
    <SleepContent />
  </Sheet>
)

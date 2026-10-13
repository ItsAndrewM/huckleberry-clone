import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { PastSleepForm } from "./past-sleep-form.tsx"

const PastSleepContent = () => {
  const { data: me } = useMe()
  if (me === undefined) return null
  return <PastSleepForm zone={me.household.timeZone} />
}

export const PastSleepSheet = () => (
  <Sheet sheet="pastSleep" title="Past sleep">
    <PastSleepContent />
  </Sheet>
)

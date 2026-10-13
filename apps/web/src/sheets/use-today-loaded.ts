import { useMe, useToday } from "../api/hooks.ts"

export const WAITS_FOR_TODAY = "Logging opens once Today loads."

export const useTodayLoaded = () => {
  const { data: me } = useMe()
  const { data: today } = useToday()
  return me !== undefined && today !== undefined
}

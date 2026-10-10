import { useSyncExternalStore } from "react"
import { createClock } from "./clock.ts"

const SECOND_MS = 1000

const clock = createClock(SECOND_MS)

export const useNow = () => useSyncExternalStore(clock.subscribe, clock.now)

import { useSyncExternalStore } from "react"
import { createClock } from "./clock.ts"

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS

const clock = createClock(SECOND_MS)
const minuteClock = createClock(MINUTE_MS)

export const useNow = () => useSyncExternalStore(clock.subscribe, clock.now)

export const useMinute = () => useSyncExternalStore(minuteClock.subscribe, minuteClock.now)

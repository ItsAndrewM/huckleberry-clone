import { clockTime } from "../clock-time.ts"

export const clockOf = (instant: number, timeZone: string) => clockTime(instant, timeZone)

import { type Instant, type Interval, MINUTE_MS } from "../time/instant.ts"

export const QUARTER_HOUR_MS = 15 * MINUTE_MS

export const slotIn = (row: Interval, fraction: number, now: Instant): Instant | null => {
  const tapped = row.start + (row.end - row.start) * Math.min(Math.max(fraction, 0), 1)
  if (tapped > now) return null
  const quarters = Math.floor((Math.min(tapped, row.end - 1) - row.start) / QUARTER_HOUR_MS)
  return row.start + quarters * QUARTER_HOUR_MS
}

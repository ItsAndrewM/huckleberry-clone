import { tzOffset } from "@date-fns/tz"
import { type Instant, MINUTE_MS } from "./instant.ts"

export type TimeZone = string

const FIXED_OFFSET = /^[+-]/

export const canonicalTimeZone = (name: string): TimeZone | null => {
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone
    return FIXED_OFFSET.test(canonical) ? null : canonical
  } catch {
    return null
  }
}

export const offsetMsAt = (zone: TimeZone, instant: Instant): number => {
  const minutes = tzOffset(zone, new Date(instant))
  if (Number.isNaN(minutes)) throw new RangeError(`No UTC offset for "${zone}" at ${instant}`)
  return minutes * MINUTE_MS
}

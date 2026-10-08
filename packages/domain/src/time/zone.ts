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

const knownZones = new Set<TimeZone>()

const assertKnownZone = (zone: TimeZone) => {
  if (knownZones.has(zone)) return
  if (canonicalTimeZone(zone) === null)
    throw new RangeError(`Expected an IANA time zone like America/Vancouver, got "${zone}"`)
  knownZones.add(zone)
}

export const offsetMsAt = (zone: TimeZone, instant: Instant): number => {
  assertKnownZone(zone)
  return tzOffset(zone, new Date(instant)) * MINUTE_MS
}

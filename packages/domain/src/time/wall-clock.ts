import type { LocalDate } from "./calendar.ts"
import { DAY_MS, type Instant } from "./instant.ts"
import { offsetMsAt, type TimeZone } from "./zone.ts"

export type LocalDateTime = string

export type LocalResolution =
  | { readonly kind: "ok"; readonly instant: Instant }
  | { readonly kind: "ambiguous"; readonly earlier: Instant; readonly later: Instant }
  | { readonly kind: "nonexistent" }

const wallMsOf = (local: LocalDateTime): number => {
  const wallMs = Date.parse(`${local}:00Z`)
  if (new Date(wallMs).toISOString().slice(0, 16) !== local) {
    throw new RangeError(`Expected a local date-time like 2026-11-01T01:30, got "${local}"`)
  }
  return wallMs
}

const instantsShowing = (wallMs: number, zone: TimeZone): Instant[] => {
  const offsets = new Set([offsetMsAt(zone, wallMs - DAY_MS), offsetMsAt(zone, wallMs + DAY_MS)])
  return [...offsets]
    .map((offset) => wallMs - offset)
    .filter((instant) => offsetMsAt(zone, instant) === wallMs - instant)
    .sort((a, b) => a - b)
}

export const resolveLocal = (local: LocalDateTime, zone: TimeZone): LocalResolution => {
  const [earlier, later] = instantsShowing(wallMsOf(local), zone)
  if (earlier === undefined) return { kind: "nonexistent" }
  if (later === undefined) return { kind: "ok", instant: earlier }
  return { kind: "ambiguous", earlier, later }
}

export const localDateTimeOf = (instant: Instant, zone: TimeZone): LocalDateTime =>
  new Date(instant + offsetMsAt(zone, instant)).toISOString().slice(0, 16)

export const startOfDate = (date: LocalDate, zone: TimeZone): Instant => {
  const midnight = wallMsOf(`${date}T00:00`)
  const [first] = instantsShowing(midnight, zone)
  return first ?? midnight - offsetMsAt(zone, midnight - DAY_MS)
}

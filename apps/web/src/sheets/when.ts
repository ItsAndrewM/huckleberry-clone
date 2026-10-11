import {
  FUTURE_TOLERANCE_MS,
  type Instant,
  type LocalDateTime,
  type LocalResolution,
  localDateTimeOf,
  resolveLocal,
} from "@bt/domain"
import { attempt } from "../storage.ts"

export type Pick = "earlier" | "later" | null

export type When =
  | { readonly kind: "now" }
  | { readonly kind: "at"; readonly local: LocalDateTime; readonly pick: Pick }

type At = Extract<When, { readonly kind: "at" }>

export type WhenIssue = "unreadable" | "nonexistent" | "ambiguous" | "in_future" | "too_early"

export type Resolved =
  | { readonly ok: true; readonly instant: Instant }
  | { readonly ok: false; readonly issue: WhenIssue }

export const NOW: When = { kind: "now" }

const resolutionOf = (local: LocalDateTime, zone: string): LocalResolution | null =>
  attempt(() => resolveLocal(local, zone), null)

export const whenAt = (instant: Instant, zone: string): When => {
  const local = localDateTimeOf(instant, zone)
  const resolution = resolutionOf(local, zone)
  if (resolution?.kind !== "ambiguous") return { kind: "at", local, pick: null }
  return { kind: "at", local, pick: instant < resolution.later ? "earlier" : "later" }
}

const issue = (found: WhenIssue): Resolved => ({ ok: false, issue: found })

const atInstant = ({ local, pick }: At, zone: string): Resolved => {
  const resolution = resolutionOf(local, zone)
  if (resolution === null) return issue("unreadable")
  if (resolution.kind === "nonexistent") return issue("nonexistent")
  if (resolution.kind === "ok") return { ok: true, instant: resolution.instant }
  if (pick === null) return issue("ambiguous")
  return { ok: true, instant: pick === "earlier" ? resolution.earlier : resolution.later }
}

const MINUTE_MS = 60_000

const sameMinute = (a: Instant, b: Instant) => Math.floor(a / MINUTE_MS) === Math.floor(b / MINUTE_MS)

export const inStartMinute = (instant: Instant, start: Instant) =>
  instant < start && sameMinute(instant, start) ? start : instant

const notBefore = (instant: Instant, earliest: Instant): Resolved => {
  if (instant >= earliest) return { ok: true, instant }
  return sameMinute(instant, earliest) ? { ok: true, instant: earliest } : issue("too_early")
}

export const resolveWhen = (when: When, zone: string, now: Instant, earliest = 0): Resolved => {
  const resolved = when.kind === "now" ? { ok: true as const, instant: now } : atInstant(when, zone)
  if (!resolved.ok) return resolved
  if (resolved.instant > now + FUTURE_TOLERANCE_MS) return issue("in_future")
  return notBefore(resolved.instant, earliest)
}

export const ambiguity = (when: When, zone: string): LocalResolution | null => {
  if (when.kind === "now") return null
  const resolution = resolutionOf(when.local, zone)
  return resolution?.kind === "ambiguous" ? resolution : null
}

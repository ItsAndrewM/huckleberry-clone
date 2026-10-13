import { MAX_SLEEP_MS, type NewSleep, type SleepKind } from "@bt/contracts"
import type { Failed } from "../../sheets/sending.ts"
import { type Resolved, resolveWhen, type When, whenAt } from "../../sheets/when.ts"
import { kindShown } from "./sleep-session.ts"

const HOUR_MS = 60 * 60_000

export interface PastSleepSession {
  readonly actionId: string
  readonly fellAsleep: When
  readonly woke: When
  readonly picked: SleepKind | null
}

export interface SleepTimes {
  readonly fellAsleep: When
  readonly woke: When
}

export type SleepSpan =
  | { readonly ok: true; readonly startedAt: number; readonly endedAt: number }
  | { readonly ok: false; readonly tooLong: boolean }

const NO_SPAN: SleepSpan = { ok: false, tooLong: false }

export const spanFrom = (start: Resolved, end: Resolved): SleepSpan => {
  if (!start.ok || !end.ok || end.instant <= start.instant) return NO_SPAN
  const tooLong = end.instant - start.instant > MAX_SLEEP_MS
  return tooLong ? { ok: false, tooLong } : { ok: true, startedAt: start.instant, endedAt: end.instant }
}

const freshSession = (start: number, now: number, zone: string): PastSleepSession => ({
  actionId: crypto.randomUUID(),
  fellAsleep: whenAt(start, zone),
  woke: whenAt(Math.min(start + HOUR_MS, now), zone),
  picked: null,
})

export const pastSleepSession = (
  failed: Failed | null,
  now: number,
  zone: string,
  at: number | null,
): PastSleepSession => {
  const action = failed?.sending.action
  if (action?.kind !== "logSleep") return freshSession(at ?? now - HOUR_MS, now, zone)
  const { actionId, startedAt, endedAt, kind } = action.payload
  return { actionId, fellAsleep: whenAt(startedAt, zone), woke: whenAt(endedAt, zone), picked: kind }
}

export const wokeAfter = (start: Resolved) => (start.ok ? start.instant + 1 : undefined)

export const spanOf = ({ fellAsleep, woke }: SleepTimes, zone: string, now: number): SleepSpan => {
  const start = resolveWhen(fellAsleep, zone, now)
  return spanFrom(start, resolveWhen(woke, zone, now, wokeAfter(start)))
}

export const pastSleepEntry = (
  actionId: string,
  times: SleepTimes,
  picked: SleepKind | null,
  zone: string,
  now: number,
): NewSleep | null => {
  const span = spanOf(times, zone, now)
  if (!span.ok) return null
  const kind = kindShown(picked, { ok: true, instant: span.startedAt }, zone, now)
  return { actionId, kind, startedAt: span.startedAt, endedAt: span.endedAt }
}

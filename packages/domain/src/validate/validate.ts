import type { LocalDate } from "../time/calendar.ts"
import { type Instant, MINUTE_MS } from "../time/instant.ts"
import { startOfDate } from "../time/wall-clock.ts"
import type { TimeZone } from "../time/zone.ts"

export const VALIDATION_ISSUES = [
  "not_finite",
  "not_positive",
  "too_many_decimals",
  "end_not_after_start",
  "before_birth",
  "in_future",
  "out_of_range",
] as const

export type ValidationIssue = (typeof VALIDATION_ISSUES)[number]

export const FUTURE_TOLERANCE_MS = 5 * MINUTE_MS

const positiveIssue = (value: number): ValidationIssue | null => {
  if (!Number.isFinite(value)) return "not_finite"
  return value > 0 ? null : "not_positive"
}

export const validateVolumeMl = (ml: number): ValidationIssue | null => {
  const issue = positiveIssue(ml)
  if (issue !== null) return issue
  const tenths = Math.round(ml * 10)
  return tenths >= 1 && Math.abs(ml * 10 - tenths) < 1e-9 ? null : "too_many_decimals"
}

export const validateDurationSeconds = (seconds: number): ValidationIssue | null => positiveIssue(seconds)

export const validateEndAfterStart = (start: Instant, end: Instant): ValidationIssue | null => {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "not_finite"
  return end > start ? null : "end_not_after_start"
}

export const validateNotBeforeBirth = (
  instant: Instant,
  birthDate: LocalDate,
  zone: TimeZone,
): ValidationIssue | null => {
  if (!Number.isFinite(instant)) return "not_finite"
  return instant >= startOfDate(birthDate, zone) ? null : "before_birth"
}

export const validateNotInFuture = (
  instant: Instant,
  serverNow: Instant,
  toleranceMs: number = FUTURE_TOLERANCE_MS,
): ValidationIssue | null => {
  if (!Number.isFinite(instant) || !Number.isFinite(serverNow)) return "not_finite"
  return instant <= serverNow + toleranceMs ? null : "in_future"
}

export const validateOunces = (ounces: number): ValidationIssue | null => {
  if (!Number.isFinite(ounces)) return "not_finite"
  return ounces >= 0 && ounces < 16 ? null : "out_of_range"
}

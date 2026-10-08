import { type Instant, SECOND_MS } from "../time/instant.ts"

export interface Span {
  readonly startedAt: Instant
  readonly endedAt: Instant | null
}

const elapsedMs = (span: Span, now: Instant) => Math.max(0, (span.endedAt ?? now) - span.startedAt)

const wholeSeconds = (ms: number) => Math.floor(ms / SECOND_MS)

export const nursingElapsed = (segments: ReadonlyArray<Span>, now: Instant): number =>
  wholeSeconds(segments.reduce((total, segment) => total + elapsedMs(segment, now), 0))

export const sleepElapsed = (session: Span, now: Instant): number => wholeSeconds(elapsedMs(session, now))

const twoDigits = (value: number) => String(value).padStart(2, "0")

export const formatElapsed = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const secondsPart = twoDigits(total % 60)
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${secondsPart}` : `${minutes}:${secondsPart}`
}

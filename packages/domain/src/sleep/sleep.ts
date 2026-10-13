import type { Instant } from "../time/instant.ts"
import { localDateTimeOf } from "../time/wall-clock.ts"
import type { TimeZone } from "../time/zone.ts"
import type { Span } from "../timer/timer.ts"

export const SLEEP_KINDS = ["nap", "night"] as const

export type SleepKind = (typeof SLEEP_KINDS)[number]

export interface SleepSession extends Span {
  readonly kind: SleepKind
}

const NIGHT_FROM_HOUR = 19
const NIGHT_UNTIL_HOUR = 7

export const sleepKindAt = (startedAt: Instant, zone: TimeZone): SleepKind => {
  const hour = Number(localDateTimeOf(startedAt, zone).slice(11, 13))
  return hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR ? "night" : "nap"
}

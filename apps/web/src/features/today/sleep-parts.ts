import type { Sleep, SleepKind } from "@bt/contracts"
import { sleepElapsed } from "@bt/domain"
import { clockTime } from "../../clock-time.ts"
import { formatMinutes } from "./format.ts"

export const SLEEP_TITLES = { nap: "Nap", night: "Night" } as const satisfies Record<SleepKind, string>

export const sleepTitle = ({ kind }: Sleep) => SLEEP_TITLES[kind]

export const sleepParts = (sleep: Sleep, timeZone: string, now: number, locale?: string) => {
  const slept = formatMinutes(sleepElapsed(sleep, now))
  if (sleep.endedAt === null) return ["Asleep now", slept]
  return [slept, `Woke ${clockTime(sleep.endedAt, timeZone, locale)}`]
}

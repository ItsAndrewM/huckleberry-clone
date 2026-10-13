import type { Sleep, Today } from "@bt/contracts"
import { sleepElapsed } from "@bt/domain"

export type SleepStatus =
  | { readonly kind: "asleep"; readonly sleep: Sleep; readonly seconds: number }
  | { readonly kind: "awake"; readonly sleep: Sleep; readonly wokeAt: number; readonly seconds: number }
  | { readonly kind: "none" }

const SECOND_MS = 1000

export const sleepStatus = ({ activeSleep, lastSleep }: Pick<Today, "activeSleep" | "lastSleep">, now: number) => {
  if (activeSleep !== null) {
    return { kind: "asleep", sleep: activeSleep, seconds: sleepElapsed(activeSleep, now) } satisfies SleepStatus
  }
  if (lastSleep === null || lastSleep.endedAt === null) return { kind: "none" } satisfies SleepStatus
  const wokeAt = lastSleep.endedAt
  const seconds = Math.max(0, Math.floor((now - wokeAt) / SECOND_MS))
  return { kind: "awake", sleep: lastSleep, wokeAt, seconds } satisfies SleepStatus
}

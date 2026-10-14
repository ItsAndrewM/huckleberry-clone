import type { SleepKind } from "@bt/contracts"
import { sleepKindAt } from "@bt/domain"
import type { Failed } from "../../sheets/sending.ts"
import { NOW, type Resolved, resolveWhen, type When, whenAt } from "../../sheets/when.ts"

export const AFTER_SLEEP = "Pick a time after she fell asleep."

const WAKE_AFTER_START_MS = 1000

export interface SleepStartSession {
  readonly actionId: string
  readonly when: When
  readonly picked: SleepKind | null
}

export const sleepStartSession = (failed: Failed | null, zone: string): SleepStartSession => {
  const action = failed?.sending.action
  if (action?.kind !== "startSleep") return { actionId: crypto.randomUUID(), when: NOW, picked: null }
  const { actionId, startedAt, kind } = action.payload
  return { actionId, when: whenAt(startedAt, zone), picked: kind }
}

export const kindShown = (picked: SleepKind | null, start: Resolved, zone: string, now: number): SleepKind =>
  picked ?? sleepKindAt(start.ok ? start.instant : now, zone)

export const sentWake = (failed: Failed | null, zone: string): When => {
  const action = failed?.sending.action
  return action?.kind === "wakeSleep" ? whenAt(action.payload.occurredAt, zone) : NOW
}

export const wakeAt = (woke: When, zone: string, now: number, startedAt: number): Resolved => {
  const resolved = woke.kind === "now" ? { ok: true as const, instant: now } : resolveWhen(woke, zone, now, startedAt)
  return resolved.ok ? { ok: true, instant: Math.max(resolved.instant, startedAt + WAKE_AFTER_START_MS) } : resolved
}

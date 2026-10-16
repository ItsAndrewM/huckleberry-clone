import type { SleepKind } from "@bt/contracts"
import { sleepKindAt } from "@bt/domain"
import type { Failed } from "../../sheets/sending.ts"
import { NOW, type Resolved, resolveSent, type When, whenAt } from "../../sheets/when.ts"

export const AFTER_SLEEP = "Pick a time after she fell asleep."

const WAKE_AFTER_START_MS = 1000

export interface SleepStartSession {
  readonly actionId: string
  readonly when: When
  readonly picked: SleepKind | null
  readonly startedAt: number | null
}

export const sleepStartSession = (failed: Failed | null, zone: string): SleepStartSession => {
  const action = failed?.sending.action
  if (action?.kind !== "startSleep") return { actionId: crypto.randomUUID(), when: NOW, picked: null, startedAt: null }
  const { actionId, startedAt, kind } = action.payload
  return { actionId, when: whenAt(startedAt, zone), picked: kind, startedAt }
}

export const startedAtOf = (session: SleepStartSession, when: When, zone: string, now: number): Resolved =>
  resolveSent(session.startedAt, session.when, when, zone, now)

export const kindShown = (picked: SleepKind | null, start: Resolved, zone: string, now: number): SleepKind =>
  picked ?? sleepKindAt(start.ok ? start.instant : now, zone)

export interface WakeSession {
  readonly actionId: string
  readonly when: When
  readonly occurredAt: number | null
}

export const wakeSession = (failed: Failed | null, sleepId: string, zone: string): WakeSession => {
  const action = failed?.sending.action
  if (action?.kind !== "wakeSleep" || action.id !== sleepId) {
    return { actionId: crypto.randomUUID(), when: NOW, occurredAt: null }
  }
  const { actionId, occurredAt } = action.payload
  return { actionId, when: whenAt(occurredAt, zone), occurredAt }
}

export const wakeLetGo = (session: WakeSession, held: Failed | null, sending: boolean) =>
  session.occurredAt !== null && held === null && !sending

export const wakeAt = (session: WakeSession, woke: When, zone: string, now: number, startedAt: number): Resolved => {
  const resolved =
    woke.kind === "now"
      ? { ok: true as const, instant: now }
      : resolveSent(session.occurredAt, session.when, woke, zone, now, startedAt)
  return resolved.ok ? { ok: true, instant: Math.max(resolved.instant, startedAt + WAKE_AFTER_START_MS) } : resolved
}

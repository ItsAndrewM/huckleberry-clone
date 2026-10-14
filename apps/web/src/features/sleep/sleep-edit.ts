import type { Sleep, SleepKind } from "@bt/contracts"
import type { SleepAction } from "../../api/actions.ts"
import type { Failed } from "../../sheets/sending.ts"
import { type Resolved, resolveWhen, sameWhen, type When, whenAt } from "../../sheets/when.ts"
import { type SleepSpan, type SleepTimes, spanFrom, wokeAfter } from "./past-sleep.ts"

export interface SleepEditSession {
  readonly actionId: string
  readonly target: { readonly id: string; readonly version: number }
  readonly startedAt: number
  readonly endedAt: number
  readonly times: SleepTimes
  readonly kind: SleepKind
}

const sessionOf = (
  actionId: string,
  target: SleepEditSession["target"],
  sleep: Pick<Sleep, "kind" | "startedAt">,
  endedAt: number,
  zone: string,
): SleepEditSession => ({
  actionId,
  target,
  startedAt: sleep.startedAt,
  endedAt,
  times: { fellAsleep: whenAt(sleep.startedAt, zone), woke: whenAt(endedAt, zone) },
  kind: sleep.kind,
})

export const sleepEditSession = (failed: Failed | null, sleep: Sleep, zone: string): SleepEditSession => {
  const action = failed?.sending.action
  if (action?.kind === "editSleep" && action.payload.endedAt !== null) {
    const { actionId, version, endedAt } = action.payload
    return sessionOf(actionId, { id: action.id, version }, action.payload, endedAt, zone)
  }
  const { id, version, startedAt, endedAt } = sleep
  return sessionOf(crypto.randomUUID(), { id, version }, sleep, endedAt ?? startedAt, zone)
}

const kept = (when: When, stored: When, instant: number, resolve: () => Resolved): Resolved =>
  sameWhen(when, stored) ? { ok: true, instant } : resolve()

export const editedStart = (session: SleepEditSession, times: SleepTimes, zone: string, now: number): Resolved =>
  kept(times.fellAsleep, session.times.fellAsleep, session.startedAt, () => resolveWhen(times.fellAsleep, zone, now))

export const editedSpan = (session: SleepEditSession, times: SleepTimes, zone: string, now: number): SleepSpan => {
  const start = editedStart(session, times, zone, now)
  const end = kept(times.woke, session.times.woke, session.endedAt, () =>
    resolveWhen(times.woke, zone, now, wokeAfter(start)),
  )
  return spanFrom(start, end)
}

export const sleepEdit = (
  session: SleepEditSession,
  kind: SleepKind,
  startedAt: number,
  endedAt: number,
): SleepAction => ({
  kind: "editSleep",
  id: session.target.id,
  payload: { actionId: session.actionId, version: session.target.version, kind, startedAt, endedAt },
})

export const sleepDelete = ({ id, version }: SleepEditSession["target"]): SleepAction => ({
  kind: "deleteSleep",
  id,
  payload: { actionId: crypto.randomUUID(), version },
})

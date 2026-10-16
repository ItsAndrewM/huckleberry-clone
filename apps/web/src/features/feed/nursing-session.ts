import { FeedConflict } from "@bt/contracts"
import { stillSaveable } from "../../sheets/saveable.ts"
import type { Failed } from "../../sheets/sending.ts"
import { NOW, type Resolved, resolveSent, type When, whenAt } from "../../sheets/when.ts"

export interface StartSession {
  readonly actionId: string
  readonly when: When
  readonly startedAt: number | null
}

export const startSession = (failed: Failed | null, zone: string): StartSession => {
  const action = failed?.sending.action
  if (action?.kind !== "startFeed") return { actionId: crypto.randomUUID(), when: NOW, startedAt: null }
  const { actionId, startedAt } = action.payload
  return { actionId, when: whenAt(startedAt, zone), startedAt }
}

export const startedAtOf = (session: StartSession, when: When, zone: string, now: number): Resolved =>
  resolveSent(session.startedAt, session.when, when, zone, now)

export interface StopSession {
  readonly actionId: string
  readonly when: When
  readonly stoppedAt: number | null
}

export const stopSession = (failed: Failed | null, feedId: string, zone: string): StopSession => {
  const action = failed?.sending.action
  if (action?.kind !== "finishFeed" || action.id !== feedId) {
    return { actionId: crypto.randomUUID(), when: NOW, stoppedAt: null }
  }
  const { actionId, occurredAt } = action.payload
  return { actionId, when: whenAt(occurredAt, zone), stoppedAt: occurredAt }
}

export const stoppedAtOf = (session: StopSession, when: When, zone: string, now: number, startedAt: number): Resolved =>
  resolveSent(session.stoppedAt, session.when, when, zone, now, startedAt)

export const emptiedBy = (failed: Failed | null) => {
  const action = failed?.sending.action
  if (!(failed?.error instanceof FeedConflict) || failed.error.code !== "FEED_EMPTY") return null
  return action?.kind === "finishFeed"
    ? { failed, current: failed.error.current, stoppedAt: action.payload.occurredAt }
    : null
}

export const finishingAfter = (failed: Failed | null): failed is Failed => failed?.sending.action.kind === "finishFeed"

export const backAsksFirst = (failed: Failed | null): failed is Failed =>
  finishingAfter(failed) && stillSaveable(failed)

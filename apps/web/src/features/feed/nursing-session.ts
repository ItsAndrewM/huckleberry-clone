import { FeedConflict } from "@bt/contracts"
import type { Failed } from "../../sheets/sending.ts"
import { NOW, type When, whenAt } from "../../sheets/when.ts"

export interface StartSession {
  readonly actionId: string
  readonly when: When
}

export const startSession = (failed: Failed | null, zone: string): StartSession => {
  const action = failed?.sending.action
  if (action?.kind !== "startFeed") return { actionId: crypto.randomUUID(), when: NOW }
  return { actionId: action.payload.actionId, when: whenAt(action.payload.startedAt, zone) }
}

export const sentStop = (failed: Failed | null, zone: string): When => {
  const action = failed?.sending.action
  return action?.kind === "finishFeed" ? whenAt(action.payload.occurredAt, zone) : NOW
}

export const emptiedBy = (failed: Failed | null) => {
  const action = failed?.sending.action
  if (!(failed?.error instanceof FeedConflict) || failed.error.code !== "FEED_EMPTY") return null
  return action?.kind === "finishFeed" ? { current: failed.error.current, stoppedAt: action.payload.occurredAt } : null
}

export const finishingAfter = (failed: Failed | null): boolean => failed?.sending.action.kind === "finishFeed"

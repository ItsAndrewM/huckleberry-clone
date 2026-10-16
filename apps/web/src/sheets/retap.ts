import type { Action } from "../api/actions.ts"
import { offersRetry, recordOf } from "./held.ts"
import { redoOf } from "./recovery.ts"
import type { Failed, Sending, Tap } from "./sending.ts"

const switchesTo = ({ action }: Sending) => (action.kind === "switchSide" ? action.to : undefined)

const sameControl = (held: Sending, fresh: Sending) =>
  held.sheet === fresh.sheet &&
  held.action.kind === fresh.action.kind &&
  recordOf(held) === recordOf(fresh) &&
  switchesTo(held) === switchesTo(fresh)

const onTheSidePicked = (held: Sending, fresh: Sending): Sending =>
  held.action.kind === "resumeFeed" && fresh.action.kind === "resumeFeed"
    ? { ...held, action: { ...held.action, payload: { ...held.action.payload, side: fresh.action.payload.side } } }
    : held

const tapOf = ({ action }: Sending): Tap | null =>
  "occurredAt" in action.payload ? { at: action.payload.occurredAt, actionId: action.payload.actionId } : null

const redoneAt = (failed: Failed, fresh: Sending): Sending | null => {
  const tap = tapOf(fresh)
  return tap === null ? null : (redoOf(failed)?.sendingAt(tap) ?? null)
}

const resentFor = (failed: Failed, fresh: Sending) =>
  offersRetry(failed.error) ? failed.sending : redoneAt(failed, fresh)

export const retapped = (held: ReadonlyArray<Failed>, fresh: Sending): Sending => {
  const own = held.find(({ sending }) => sameControl(sending, fresh))
  const resent = own === undefined ? null : resentFor(own, fresh)
  return resent === null ? fresh : onTheSidePicked(resent, fresh)
}

export const heldAs = (held: ReadonlyArray<Failed>, kind: Action["kind"], id: string | null = null) =>
  held.find(({ sending }) => sending.action.kind === kind && recordOf(sending) === id) ?? null

import type { Sleep, SleepKind } from "@bt/contracts"
import type { SleepAction } from "../../api/actions.ts"
import { isPending } from "../../api/pending.ts"
import type { Sending } from "../../sheets/sending.ts"

export type SleepState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "running"; readonly sleep: Sleep }

export const sleepState = (active: Sleep | null): SleepState => {
  if (active === null) return { kind: "idle" }
  return isPending(active.id) ? { kind: "starting" } : { kind: "running", sleep: active }
}

export const sleepWaits = (busy: Sending | null) => busy?.sheet === "sleep"

export const startAction = (actionId: string, kind: SleepKind, startedAt: number): SleepAction => ({
  kind: "startSleep",
  payload: { actionId, kind, startedAt },
})

export const wakeAction = (sleep: Sleep, occurredAt: number): SleepAction => ({
  kind: "wakeSleep",
  id: sleep.id,
  payload: { actionId: crypto.randomUUID(), version: sleep.version, occurredAt },
})

export const runningEdit = (sleep: Sleep, kind: SleepKind, startedAt: number): SleepAction => ({
  kind: "editSleep",
  id: sleep.id,
  payload: { actionId: crypto.randomUUID(), version: sleep.version, kind, startedAt, endedAt: null },
})

export const deleteAction = (sleep: Sleep): SleepAction => ({
  kind: "deleteSleep",
  id: sleep.id,
  payload: { actionId: crypto.randomUUID(), version: sleep.version },
})

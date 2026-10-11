import type { Feed, Prefill } from "@bt/contracts"
import type { FeedAction } from "../../api/actions.ts"
import { isSaving } from "../../api/pending.ts"
import type { Failed } from "../../sheets/sending.ts"
import { inStartMinute, NOW, type When, whenAt } from "../../sheets/when.ts"

export interface Amounts {
  readonly breastMilkMl: number | null
  readonly formulaMl: number | null
}

export interface BottleSession extends Amounts {
  readonly actionId: string
  readonly when: When
}

const sentBottle = (failed: Failed | null) => {
  const action = failed?.sending.action
  if (action?.kind === "addBottle") return action.payload
  if (action?.kind !== "logFeed") return undefined
  const [portion] = action.payload.portions
  return portion === undefined ? undefined : { ...portion, actionId: action.payload.actionId }
}

export const bottleSession = (failed: Failed | null, prefill: Prefill | undefined, zone: string): BottleSession => {
  const sent = sentBottle(failed)
  if (sent !== undefined) {
    const { actionId, breastMilkMl, formulaMl, occurredAt } = sent
    return { actionId, breastMilkMl, formulaMl, when: whenAt(occurredAt, zone) }
  }
  const last = prefill?.lastBottle
  return {
    actionId: crypto.randomUUID(),
    breastMilkMl: last?.breastMilkMl ?? 0,
    formulaMl: last?.formulaMl ?? 0,
    when: NOW,
  }
}

export const hasMilk = ({ breastMilkMl, formulaMl }: Amounts) =>
  breastMilkMl !== null && formulaMl !== null && breastMilkMl + formulaMl > 0

export const toppedUpFeed = (active: Feed | null, occurredAt: number) =>
  active !== null && inStartMinute(occurredAt, active.startedAt) >= active.startedAt ? active : null

export const canSaveBottle = (amounts: Amounts, toppedUp: Feed | null) =>
  hasMilk(amounts) && (toppedUp === null || !isSaving(toppedUp))

export const bottleAction = (
  actionId: string,
  { breastMilkMl, formulaMl }: Amounts,
  occurredAt: number,
  active: Feed | null,
): FeedAction => {
  const toppedUp = toppedUpFeed(active, occurredAt)
  const at = toppedUp === null ? occurredAt : inStartMinute(occurredAt, toppedUp.startedAt)
  const portion = { occurredAt: at, breastMilkMl: breastMilkMl ?? 0, formulaMl: formulaMl ?? 0 }
  if (toppedUp === null) return { kind: "logFeed", payload: { actionId, segments: [], portions: [portion] } }
  return { kind: "addBottle", id: toppedUp.id, payload: { actionId, version: toppedUp.version, ...portion } }
}

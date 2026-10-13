import type { Feed, Prefill } from "@bt/contracts"
import type { FeedAction } from "../../api/actions.ts"
import { isSaving } from "../../api/pending.ts"
import { mayHoldReceipt } from "../../sheets/held.ts"
import type { Failed } from "../../sheets/sending.ts"
import { inStartMinute, NOW, type When, whenAt } from "../../sheets/when.ts"

export interface Amounts {
  readonly breastMilkMl: number | null
  readonly formulaMl: number | null
}

export type HeldRoute =
  | { readonly kind: "logFeed" }
  | { readonly kind: "addBottle"; readonly id: string; readonly version: number }
  | null

export interface BottleSession extends Amounts {
  readonly actionId: string
  readonly when: When
  readonly held: HeldRoute
}

const sentBottle = (failed: Failed | null) => {
  const action = failed?.sending.action
  if (failed === null || action === undefined) return undefined
  const keeps = mayHoldReceipt(failed.error)
  if (action.kind === "addBottle") {
    const held: HeldRoute = keeps ? { kind: "addBottle", id: action.id, version: action.payload.version } : null
    return { ...action.payload, held }
  }
  if (action.kind !== "logFeed") return undefined
  const [portion] = action.payload.portions
  const held: HeldRoute = keeps ? { kind: "logFeed" } : null
  return portion === undefined ? undefined : { ...portion, actionId: action.payload.actionId, held }
}

export const bottleSession = (
  failed: Failed | null,
  prefill: Prefill | undefined,
  zone: string,
  at: number | null,
): BottleSession => {
  const sent = sentBottle(failed)
  if (sent !== undefined) {
    const { actionId, breastMilkMl, formulaMl, occurredAt, held } = sent
    return { actionId, breastMilkMl, formulaMl, when: whenAt(occurredAt, zone), held }
  }
  const last = prefill?.lastBottle
  return {
    actionId: crypto.randomUUID(),
    breastMilkMl: last?.breastMilkMl ?? 0,
    formulaMl: last?.formulaMl ?? 0,
    when: at === null ? NOW : whenAt(at, zone),
    held: null,
  }
}

export const hasMilk = ({ breastMilkMl, formulaMl }: Amounts) =>
  breastMilkMl !== null && formulaMl !== null && breastMilkMl + formulaMl > 0

export const toppedUpFeed = (active: Feed | null, occurredAt: number) =>
  active !== null && inStartMinute(occurredAt, active.startedAt) >= active.startedAt ? active : null

export const toppedUpFor = (active: Feed | null, occurredAt: number, held: HeldRoute) => {
  if (held?.kind === "logFeed") return null
  if (held?.kind === "addBottle") return active?.id === held.id ? active : null
  return toppedUpFeed(active, occurredAt)
}

export const canSaveBottle = (amounts: Amounts, toppedUp: Feed | null) =>
  hasMilk(amounts) && (toppedUp === null || !isSaving(toppedUp))

const targetOf = (toppedUp: Feed | null, held: HeldRoute) => {
  if (held?.kind === "addBottle") return { id: held.id, version: held.version, startedAt: toppedUp?.startedAt ?? null }
  if (toppedUp === null) return null
  return { id: toppedUp.id, version: toppedUp.version, startedAt: toppedUp.startedAt }
}

export const bottleAction = (
  actionId: string,
  { breastMilkMl, formulaMl }: Amounts,
  occurredAt: number,
  active: Feed | null,
  held: HeldRoute = null,
): FeedAction => {
  const target = targetOf(toppedUpFor(active, occurredAt, held), held)
  const start = target?.startedAt ?? null
  const at = start === null ? occurredAt : inStartMinute(occurredAt, start)
  const portion = { occurredAt: at, breastMilkMl: breastMilkMl ?? 0, formulaMl: formulaMl ?? 0 }
  if (target === null) return { kind: "logFeed", payload: { actionId, segments: [], portions: [portion] } }
  return { kind: "addBottle", id: target.id, payload: { actionId, version: target.version, ...portion } }
}

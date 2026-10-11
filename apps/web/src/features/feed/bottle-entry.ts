import type { Feed, Prefill } from "@bt/contracts"
import type { FeedAction } from "../../api/actions.ts"
import type { Failed } from "../../sheets/sending.ts"
import { NOW, type When, whenAt } from "../../sheets/when.ts"

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

export const bottleAction = (
  actionId: string,
  { breastMilkMl, formulaMl }: Amounts,
  occurredAt: number,
  active: Feed | null,
): FeedAction => {
  const portion = { occurredAt, breastMilkMl: breastMilkMl ?? 0, formulaMl: formulaMl ?? 0 }
  if (active === null) return { kind: "logFeed", payload: { actionId, segments: [], portions: [portion] } }
  return { kind: "addBottle", id: active.id, payload: { actionId, version: active.version, ...portion } }
}

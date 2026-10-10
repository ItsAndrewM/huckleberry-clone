import type { Diaper, Today, Totals } from "@bt/contracts"

export const NOW = Date.UTC(2026, 9, 9, 16, 30)
export const EMILY = "caregiver-emily"

export const NO_TOTALS: Totals = {
  feedsStarted: 0,
  leftSeconds: 0,
  rightSeconds: 0,
  nursingSeconds: 0,
  breastMilkMl: 0,
  formulaMl: 0,
  bottleMl: 0,
  diapers: 0,
  wetDiapers: 0,
  dirtyDiapers: 0,
}

const audit = (at: number, by: string) => ({
  version: 1,
  createdBy: by,
  createdAt: at,
  updatedBy: by,
  updatedAt: at,
  deletedAt: null,
})

export const diaperAt = (occurredAt: number, change: Partial<Diaper> = {}): Diaper => ({
  id: `diaper-${occurredAt}`,
  occurredAt,
  wet: true,
  dirty: false,
  ...audit(occurredAt, EMILY),
  ...change,
})

export const todayWith = (change: Partial<Today> = {}): Today => ({
  date: "2026-10-09",
  totals: NO_TOTALS,
  activeFeed: null,
  lastFeed: null,
  prefill: { lastBottle: null, lastSide: null },
  recent: [],
  ...change,
})

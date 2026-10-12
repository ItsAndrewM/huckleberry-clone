import type { NewFeed, PortionEntry, SegmentEntry, Side } from "@bt/contracts"
import { ACTION_ID, MINUTE_MS } from "./fixtures.ts"

export const segment = (side: Side, startedAt: number, endedAt: number): SegmentEntry => ({ side, startedAt, endedAt })

export const bottle = (occurredAt: number, breastMilkMl = 60, formulaMl = 0): PortionEntry => ({
  occurredAt,
  breastMilkMl,
  formulaMl,
})

export const newFeed = (segments: SegmentEntry[], portions: PortionEntry[] = []): NewFeed => ({
  actionId: ACTION_ID,
  segments,
  portions,
})

export const rowCount = (sql: SqlStorage, table: string) =>
  sql.exec<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).one().n

const SUNDAY_OCT_11_AT_23_30 = Date.UTC(2026, 9, 12, 6, 30)
const SUNDAY_OCT_11_AT_23_45 = SUNDAY_OCT_11_AT_23_30 + 15 * MINUTE_MS
const MONDAY_OCT_12_BEGINS = Date.UTC(2026, 9, 12, 7)
export const WEDNESDAY_OCT_14_NOON = Date.UTC(2026, 9, 14, 19)

export const PAST_FEED_WITH_ITS_BOTTLE_AT_MIDNIGHT = newFeed(
  [
    segment("left", SUNDAY_OCT_11_AT_23_30, SUNDAY_OCT_11_AT_23_45),
    segment("right", SUNDAY_OCT_11_AT_23_45, MONDAY_OCT_12_BEGINS),
  ],
  [bottle(MONDAY_OCT_12_BEGINS)],
)

export const CHANGED_SUNDAY_AND_MONDAY = [
  ["today"],
  ["last24h"],
  ["day", "2026-10-11"],
  ["day", "2026-10-12"],
  ["week", "2026-W41"],
  ["week", "2026-W42"],
  ["month", "2026-10"],
]

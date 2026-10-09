import type { NewFeed, PortionEntry, SegmentEntry, Side } from "@bt/contracts"
import { ACTION_ID } from "./fixtures.ts"

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

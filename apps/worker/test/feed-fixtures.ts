import type { Feed, NewFeed, PortionEntry, SegmentEntry, Side } from "@bt/contracts"
import { runInDurableObject } from "cloudflare:test"
import type { CoreResult, Stamp } from "../src/core/receipts.ts"
import { ANDREW, seededHousehold } from "./fixtures.ts"

export const NOW = Date.UTC(2026, 9, 8, 19)
export const MINUTE_MS = 60_000

export const minutesAgo = (minutes: number) => NOW - minutes * MINUTE_MS

export const caregiverId = (sql: SqlStorage, email: string) =>
  sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id

export const stampOf = (sql: SqlStorage, email = ANDREW.email, now = NOW): Stamp => ({
  caregiverId: caregiverId(sql, email),
  now,
})

export const inHousehold = async <R>(run: (sql: SqlStorage) => R) =>
  runInDurableObject(await seededHousehold(), (_instance, state) => run(state.storage.sql))

export const segment = (side: Side, startedAt: number, endedAt: number): SegmentEntry => ({ side, startedAt, endedAt })

export const bottle = (occurredAt: number, breastMilkMl = 60, formulaMl = 0): PortionEntry => ({
  occurredAt,
  breastMilkMl,
  formulaMl,
})

export const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
export const BIRTH_DATE_BEGINS = Date.UTC(2026, 8, 1, 7)
export const CHANGED_TODAY = [["today"], ["last24h"], ["day", "2026-10-08"], ["week", "2026-W41"], ["month", "2026-10"]]

export const newFeed = (segments: SegmentEntry[], portions: PortionEntry[] = []): NewFeed => ({
  actionId: ACTION_ID,
  segments,
  portions,
})

export const saved = <E>(result: CoreResult<Feed, E>): Feed => {
  if (!result.ok) throw new Error(`expected the core to save, but it answered ${JSON.stringify(result.error)}`)
  return result.response
}

export const rowCount = (sql: SqlStorage, table: string) =>
  sql.exec<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).one().n

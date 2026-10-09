import type { PortionEntry, SegmentEntry, Side } from "@bt/contracts"
import { runInDurableObject } from "cloudflare:test"
import type { Stamp } from "../src/core/receipts.ts"
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

import { env, runInDurableObject } from "cloudflare:test"
import type { CoreResult, Stamp } from "../src/core/receipts.ts"
import type { HouseholdSeed } from "../src/seed.ts"

export const ANDREW = { email: "andrew@example.test", displayName: "Andrew" }
export const EMILY = { email: "emily@example.test", displayName: "Emily" }

export const SEED: HouseholdSeed = {
  name: "Test household",
  timeZone: "America/Vancouver",
  caregivers: [ANDREW, EMILY],
  child: { name: "Robin", birthDate: "2026-09-01", sex: "female", gestationalAgeDays: 281 },
}

export const NOW = Date.UTC(2026, 9, 8, 19)
export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS

export const minutesAgo = (minutes: number) => NOW - minutes * MINUTE_MS

export const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
export const BIRTH_DATE_BEGINS = Date.UTC(2026, 8, 1, 7)
export const SEP_30_AT_23_30 = Date.UTC(2026, 9, 1, 6, 30)
export const OCT_1_AT_00_30 = Date.UTC(2026, 9, 1, 7, 30)
export const CHANGED_TODAY = [["today"], ["last24h"], ["day", "2026-10-08"], ["week", "2026-W41"], ["month", "2026-10"]]

export const NO_TOTALS = {
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

export const newHousehold = () => env.HOUSEHOLD.getByName(crypto.randomUUID())

export const seededHousehold = async (seed: HouseholdSeed = SEED) => {
  const household = newHousehold()
  await household.seedHousehold(seed)
  return household
}

export const inHousehold = async <R>(run: (sql: SqlStorage) => R) =>
  runInDurableObject(await seededHousehold(), (_instance, state) => run(state.storage.sql))

export const caregiverId = (sql: SqlStorage, email: string) =>
  sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id

export const stampOf = (sql: SqlStorage, email = ANDREW.email, now = NOW): Stamp => ({
  caregiverId: caregiverId(sql, email),
  now,
})

export const saved = <A, E>(result: CoreResult<A, E>): A => {
  if (!result.ok) throw new Error(`expected the core to save, but it answered ${JSON.stringify(result.error)}`)
  return result.response
}

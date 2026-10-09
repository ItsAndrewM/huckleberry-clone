import { canonicalTimeZone } from "@bt/domain"
import type { HouseholdSeed, SeedResult } from "../seed.ts"

type HouseholdRow = { name: string; time_zone: string }
type CaregiverRow = { email: string; display_name: string }
type ChildRow = { name: string; birth_date: string; sex: "female" | "male"; gestational_age_days: number }

const storedHousehold = (sql: SqlStorage): HouseholdSeed | undefined => {
  const [household] = sql.exec<HouseholdRow>("SELECT name, time_zone FROM household").toArray()
  if (household === undefined) return undefined
  const caregivers = sql
    .exec<CaregiverRow>("SELECT email, display_name FROM caregivers ORDER BY rowid")
    .toArray()
    .map(({ email, display_name }) => ({ email, displayName: display_name }))
  const child = sql.exec<ChildRow>("SELECT name, birth_date, sex, gestational_age_days FROM child").one()
  return {
    name: household.name,
    timeZone: household.time_zone,
    caregivers,
    child: {
      name: child.name,
      birthDate: child.birth_date,
      sex: child.sex,
      gestationalAgeDays: child.gestational_age_days,
    },
  }
}

const insertHousehold = (sql: SqlStorage, seed: HouseholdSeed, now: number) => {
  sql.exec(
    "INSERT INTO household (id, name, time_zone, created_at, updated_at) VALUES (1, ?, ?, ?, ?)",
    seed.name,
    seed.timeZone,
    now,
    now,
  )
  for (const { email, displayName } of seed.caregivers) {
    sql.exec(
      "INSERT INTO caregivers (id, email, display_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      crypto.randomUUID(),
      email,
      displayName,
      now,
      now,
    )
  }
  const { name, birthDate, sex, gestationalAgeDays } = seed.child
  sql.exec(
    "INSERT INTO child (id, name, birth_date, sex, gestational_age_days, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)",
    name,
    birthDate,
    sex,
    gestationalAgeDays,
    now,
    now,
  )
}

export const seedHousehold = (storage: DurableObjectStorage, seed: HouseholdSeed, now: number): SeedResult =>
  storage.transactionSync(() => {
    const existing = storedHousehold(storage.sql)
    if (existing !== undefined) return { created: false, household: existing }
    const timeZone = canonicalTimeZone(seed.timeZone)
    if (timeZone === null) throw new RangeError(`Expected an IANA time zone, got "${seed.timeZone}"`)
    const household = { ...seed, timeZone }
    insertHousehold(storage.sql, household, now)
    return { created: true, household }
  })

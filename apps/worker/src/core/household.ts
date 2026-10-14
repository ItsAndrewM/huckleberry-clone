import type {
  Caregiver,
  CaregiverName,
  Child,
  Household,
  LengthUnit,
  Me,
  Sex,
  VolumeUnit,
  WeightUnit,
} from "@bt/contracts"
import { canonicalTimeZone } from "@bt/domain"
import type { HouseholdSeed, SeedResult } from "../seed.ts"
import { seedVitaminD, supplementsOf } from "./supplements/definitions.ts"

export type HouseholdRow = {
  name: string
  time_zone: string
  volume_unit: VolumeUnit
  weight_unit: WeightUnit
  length_unit: LengthUnit
  version: number
  updated_by: string | null
  updated_at: number
}
export type ChildRow = {
  name: string
  birth_date: string
  sex: Sex
  gestational_age_days: number
  version: number
  updated_by: string | null
  updated_at: number
}
type CaregiverRow = { email: string; display_name: string }

export const HOUSEHOLD_COLUMNS =
  "name, time_zone, volume_unit, weight_unit, length_unit, version, updated_by, updated_at"
export const CHILD_COLUMNS = "name, birth_date, sex, gestational_age_days, version, updated_by, updated_at"

export const householdFrom = (row: HouseholdRow): Household => ({
  name: row.name,
  timeZone: row.time_zone,
  units: { volume: row.volume_unit, weight: row.weight_unit, length: row.length_unit },
  version: row.version,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
})

export const childFrom = (row: ChildRow): Child => ({
  name: row.name,
  birthDate: row.birth_date,
  sex: row.sex,
  gestationalAgeDays: row.gestational_age_days,
  version: row.version,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
})

export const householdOf = (sql: SqlStorage): Household =>
  householdFrom(sql.exec<HouseholdRow>(`SELECT ${HOUSEHOLD_COLUMNS} FROM household`).one())

export const childOf = (sql: SqlStorage): Child =>
  childFrom(sql.exec<ChildRow>(`SELECT ${CHILD_COLUMNS} FROM child`).one())

const storedHousehold = (sql: SqlStorage): HouseholdSeed | undefined => {
  const [household] = sql.exec<HouseholdRow>(`SELECT ${HOUSEHOLD_COLUMNS} FROM household`).toArray()
  if (household === undefined) return undefined
  const caregivers = sql
    .exec<CaregiverRow>("SELECT email, display_name FROM caregivers ORDER BY rowid")
    .toArray()
    .map(({ email, display_name }) => ({ email, displayName: display_name }))
  const { name, birthDate, sex, gestationalAgeDays } = childOf(sql)
  return {
    name: household.name,
    timeZone: household.time_zone,
    caregivers,
    child: { name, birthDate, sex, gestationalAgeDays },
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
  seedVitaminD(sql, now)
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

const caregiverNames = (sql: SqlStorage): CaregiverName[] =>
  sql
    .exec<{ id: string; display_name: string }>("SELECT id, display_name FROM caregivers ORDER BY rowid")
    .toArray()
    .map(({ id, display_name }) => ({ id, displayName: display_name }))

export const meOf = (sql: SqlStorage, caregiver: Caregiver): Me => ({
  caregiver,
  household: { ...householdOf(sql), caregivers: caregiverNames(sql), supplements: supplementsOf(sql) },
  child: childOf(sql),
})

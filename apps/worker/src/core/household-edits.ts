import {
  type Changed,
  type Child,
  ChildConflict,
  type ChildEdit,
  type Household,
  HouseholdConflict,
  type HouseholdEdit,
  InvalidInput,
  queryKeys,
} from "@bt/contracts"
import {
  canonicalTimeZone,
  type Instant,
  type LocalDate,
  localDateOf,
  type ValidationIssue,
  validateNotBeforeBirth,
} from "@bt/domain"
import { calendarOf } from "./calendar.ts"
import {
  CHILD_COLUMNS,
  childFrom,
  childOf,
  type ChildRow,
  HOUSEHOLD_COLUMNS,
  householdFrom,
  householdOf,
  type HouseholdRow,
} from "./household.ts"
import type { CoreResult, Stamp } from "./receipts.ts"

const PROFILE_CHANGED: Changed = [queryKeys.me, queryKeys.today, queryKeys.last24h]

export const editHousehold =
  (stamp: Stamp, edit: HouseholdEdit) =>
  (sql: SqlStorage): CoreResult<Household, HouseholdConflict> => {
    const current = householdOf(sql)
    if (current.version !== edit.version) {
      return { ok: false, error: new HouseholdConflict({ code: "STALE_VERSION", current }) }
    }
    const timeZone = canonicalTimeZone(edit.timeZone)
    if (timeZone === null) throw new RangeError(`Expected an IANA time zone, got "${edit.timeZone}"`)
    const row = sql
      .exec<HouseholdRow>(
        `UPDATE household
         SET time_zone = ?, volume_unit = ?, weight_unit = ?, length_unit = ?, version = version + 1, updated_by = ?, updated_at = ?
         RETURNING ${HOUSEHOLD_COLUMNS}`,
        timeZone,
        edit.units.volume,
        edit.units.weight,
        edit.units.length,
        stamp.caregiverId,
        stamp.now,
      )
      .one()
    return { ok: true, response: householdFrom(row), changed: PROFILE_CHANGED }
  }

const earliestRecordAt = (sql: SqlStorage): Instant | null =>
  sql
    .exec<{ at: number | null }>(
      `SELECT min(at) AS at FROM (
         SELECT min(occurred_at) AS at FROM diapers WHERE deleted_at IS NULL
         UNION ALL SELECT min(started_at) FROM feeds WHERE deleted_at IS NULL
         UNION ALL SELECT min(measured_at) FROM growth_measurements WHERE deleted_at IS NULL
         UNION ALL SELECT min(started_at) FROM sleeps WHERE deleted_at IS NULL
       )`,
    )
    .one().at

const birthDateIssue = (sql: SqlStorage, birthDate: LocalDate, now: Instant): ValidationIssue | null => {
  const { zone } = calendarOf(sql)
  if (birthDate > localDateOf(now, zone)) return "in_future"
  const earliest = earliestRecordAt(sql)
  return earliest === null ? null : validateNotBeforeBirth(earliest, birthDate, zone)
}

export const editChild =
  (stamp: Stamp, edit: ChildEdit) =>
  (sql: SqlStorage): CoreResult<Child, InvalidInput | ChildConflict> => {
    const current = childOf(sql)
    if (current.version !== edit.version) {
      return { ok: false, error: new ChildConflict({ code: "STALE_VERSION", current }) }
    }
    const issue = edit.birthDate === current.birthDate ? null : birthDateIssue(sql, edit.birthDate, stamp.now)
    if (issue !== null) return { ok: false, error: new InvalidInput({ fieldErrors: [{ path: "birthDate", issue }] }) }
    const row = sql
      .exec<ChildRow>(
        `UPDATE child
         SET name = ?, birth_date = ?, sex = ?, gestational_age_days = ?, version = version + 1, updated_by = ?, updated_at = ?
         RETURNING ${CHILD_COLUMNS}`,
        edit.name,
        edit.birthDate,
        edit.sex,
        edit.gestationalAgeDays,
        stamp.caregiverId,
        stamp.now,
      )
      .one()
    return { ok: true, response: childFrom(row), changed: PROFILE_CHANGED }
  }

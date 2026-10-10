import { type Changed, type Household, HouseholdConflict, type HouseholdEdit, queryKeys } from "@bt/contracts"
import { canonicalTimeZone } from "@bt/domain"
import { HOUSEHOLD_COLUMNS, householdFrom, householdOf, type HouseholdRow } from "./household.ts"
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

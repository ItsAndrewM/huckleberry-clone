import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { ActionId } from "./action-id.ts"
import { Conflict, InvalidInput } from "./errors.ts"
import { Changed } from "./query-keys.ts"
import { Instant, LocalDate, TimeZone } from "./time.ts"
import { Version } from "./version.ts"

const EARLIEST_BIRTH_DAYS = 154
const LATEST_BIRTH_DAYS = 314

export const Name = Schema.String.check(Schema.isTrimmed(), Schema.isBetweenLength(1, 60))
export type Name = typeof Name.Type

export const Sex = Schema.Literals(["female", "male"])
export type Sex = typeof Sex.Type

export const GestationalAgeDays = Schema.Int.check(
  Schema.isBetween({ minimum: EARLIEST_BIRTH_DAYS, maximum: LATEST_BIRTH_DAYS }),
)
export type GestationalAgeDays = typeof GestationalAgeDays.Type

export const VolumeUnit = Schema.Literals(["ml", "fl_oz"])
export type VolumeUnit = typeof VolumeUnit.Type

export const WeightUnit = Schema.Literals(["kg", "g", "lb_oz"])
export type WeightUnit = typeof WeightUnit.Type

export const LengthUnit = Schema.Literals(["cm", "in"])
export type LengthUnit = typeof LengthUnit.Type

export const Units = Schema.Struct({ volume: VolumeUnit, weight: WeightUnit, length: LengthUnit })
export type Units = typeof Units.Type

const audit = { version: Version, updatedBy: Schema.NullOr(Schema.String), updatedAt: Instant }

const householdFields = { timeZone: TimeZone, units: Units }

const childFields = { name: Name, birthDate: LocalDate, sex: Sex, gestationalAgeDays: GestationalAgeDays }

export const Household = Schema.Struct({ name: Schema.String, ...householdFields, ...audit })
export type Household = typeof Household.Type

export const Child = Schema.Struct({ ...childFields, ...audit })
export type Child = typeof Child.Type

export const HouseholdEdit = Schema.Struct({ actionId: ActionId, version: Version, ...householdFields })
export type HouseholdEdit = typeof HouseholdEdit.Type

export const ChildEdit = Schema.Struct({ actionId: ActionId, version: Version, ...childFields })
export type ChildEdit = typeof ChildEdit.Type

export const SavedHousehold = Schema.Struct({ household: Household, changed: Changed })
export type SavedHousehold = typeof SavedHousehold.Type

export const SavedChild = Schema.Struct({ child: Child, changed: Changed })
export type SavedChild = typeof SavedChild.Type

export class HouseholdConflict extends Conflict<HouseholdConflict>()(
  "HouseholdConflict",
  ["STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Household,
) {}

export class ChildConflict extends Conflict<ChildConflict>()(
  "ChildConflict",
  ["STALE_VERSION", "ACTION_REPLAY_MISMATCH"],
  Child,
) {}

export class HouseholdGroup extends HttpApiGroup.make("household").add(
  HttpApiEndpoint.patch("editHousehold", "/household", {
    payload: HouseholdEdit,
    success: SavedHousehold,
    error: [InvalidInput, HouseholdConflict],
  }),
) {}

export class ChildGroup extends HttpApiGroup.make("child").add(
  HttpApiEndpoint.patch("editChild", "/child", {
    payload: ChildEdit,
    success: SavedChild,
    error: [InvalidInput, ChildConflict],
  }),
) {}

import { LocalDate, TimeZone } from "@bt/contracts"
import { Schema } from "effect"

const Name = Schema.String.check(Schema.isTrimmed(), Schema.isBetweenLength(1, 60))

const Email = Schema.String.check(Schema.isLowercased(), Schema.isPattern(/^[^\s@]+@[^\s@]+$/))

const CaregiverSeed = Schema.Struct({ email: Email, displayName: Name })

const distinctEmails = Schema.makeFilter(
  (caregivers: ReadonlyArray<{ readonly email: string }>) =>
    new Set(caregivers.map(({ email }) => email)).size === caregivers.length,
  { expected: "caregivers with different emails" },
)

const EARLIEST_BIRTH_DAYS = 154
const LATEST_BIRTH_DAYS = 314

export const HouseholdSeed = Schema.Struct({
  name: Name,
  timeZone: TimeZone,
  caregivers: Schema.Array(CaregiverSeed).check(Schema.isMinLength(1), distinctEmails),
  child: Schema.Struct({
    name: Name,
    birthDate: LocalDate,
    sex: Schema.Literals(["female", "male"]),
    gestationalAgeDays: Schema.Int.check(
      Schema.isBetween({ minimum: EARLIEST_BIRTH_DAYS, maximum: LATEST_BIRTH_DAYS }),
    ),
  }),
})
export type HouseholdSeed = typeof HouseholdSeed.Type

export interface SeedResult {
  readonly created: boolean
  readonly household: HouseholdSeed
}

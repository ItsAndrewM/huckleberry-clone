import { GestationalAgeDays, LocalDate, Name, Sex, TimeZone } from "@bt/contracts"
import { Schema } from "effect"

export const Email = Schema.String.check(Schema.isLowercased(), Schema.isPattern(/^[^\s@]+@[^\s@]+$/))

const CaregiverSeed = Schema.Struct({ email: Email, displayName: Name })

const distinctEmails = Schema.makeFilter(
  (caregivers: ReadonlyArray<{ readonly email: string }>) =>
    new Set(caregivers.map(({ email }) => email)).size === caregivers.length,
  { expected: "caregivers with different emails" },
)

export const HouseholdSeed = Schema.Struct({
  name: Name,
  timeZone: TimeZone,
  caregivers: Schema.Array(CaregiverSeed).check(Schema.isMinLength(1), distinctEmails),
  child: Schema.Struct({ name: Name, birthDate: LocalDate, sex: Sex, gestationalAgeDays: GestationalAgeDays }),
})
export type HouseholdSeed = typeof HouseholdSeed.Type

export interface SeedResult {
  readonly created: boolean
  readonly household: HouseholdSeed
}

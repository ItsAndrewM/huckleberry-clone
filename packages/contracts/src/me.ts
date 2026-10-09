import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { LocalDate, TimeZone } from "./time.ts"

export const Caregiver = Schema.Struct({ id: Schema.String, email: Schema.String, displayName: Schema.String })
export type Caregiver = typeof Caregiver.Type

export const CaregiverName = Schema.Struct({ id: Schema.String, displayName: Schema.String })
export type CaregiverName = typeof CaregiverName.Type

export const Me = Schema.Struct({
  caregiver: Caregiver,
  household: Schema.Struct({ name: Schema.String, timeZone: TimeZone, caregivers: Schema.Array(CaregiverName) }),
  child: Schema.Struct({ name: Schema.String, birthDate: LocalDate }),
})
export type Me = typeof Me.Type

export class MeGroup extends HttpApiGroup.make("me").add(HttpApiEndpoint.get("me", "/me", { success: Me })) {}

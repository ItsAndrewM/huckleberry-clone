import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Child, Household } from "./household.ts"
import { Supplement } from "./supplements.ts"

export const Caregiver = Schema.Struct({ id: Schema.String, email: Schema.String, displayName: Schema.String })
export type Caregiver = typeof Caregiver.Type

export const CaregiverName = Schema.Struct({ id: Schema.String, displayName: Schema.String })
export type CaregiverName = typeof CaregiverName.Type

export const Me = Schema.Struct({
  caregiver: Caregiver,
  household: Schema.Struct({
    ...Household.fields,
    caregivers: Schema.Array(CaregiverName),
    supplements: Schema.Array(Supplement),
  }),
  child: Child,
})
export type Me = typeof Me.Type

export class MeGroup extends HttpApiGroup.make("me").add(HttpApiEndpoint.get("me", "/me", { success: Me })) {}

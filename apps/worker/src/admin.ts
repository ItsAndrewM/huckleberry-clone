import { InvalidInput, invalidInputFrom, NotFound } from "@bt/contracts"
import { Result, Schema } from "effect"
import { errorResponse } from "./error-response.ts"
import { Email, type HouseholdSeed, HouseholdSeed as Seed, type SeedResult } from "./seed.ts"

export interface CaregiverStatus {
  readonly email: string
  readonly active: boolean
  readonly closedSockets: number
}

export type EmailChangeResult =
  | { readonly kind: "changed"; readonly email: string; readonly closedSockets: number }
  | { readonly kind: "unknown" }
  | { readonly kind: "taken" }

export interface AdminHousehold {
  seedHousehold(seed: HouseholdSeed): Promise<SeedResult>
  disableCaregiver(email: string): Promise<CaregiverStatus | undefined>
  enableCaregiver(email: string): Promise<CaregiverStatus | undefined>
  setCaregiverEmail(email: string, newEmail: string): Promise<EmailChangeResult>
}

type AdminRoute = (request: Request, household: AdminHousehold) => Promise<Response>

const decodeSeed = Schema.decodeUnknownResult(Schema.fromJsonString(Seed), { errors: "all" })

const decodeCaregiver = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Struct({ email: Email })), {
  errors: "all",
})

const decodeEmailChange = Schema.decodeUnknownResult(
  Schema.fromJsonString(Schema.Struct({ email: Email, newEmail: Email })),
  { errors: "all" },
)

const noStore = { "cache-control": "no-store" }

const refusedField = (path: string) => errorResponse(new InvalidInput({ fieldErrors: [{ path, issue: "invalid" }] }))

const seed: AdminRoute = async (request, household) => {
  const decoded = decodeSeed(await request.text())
  if (Result.isFailure(decoded)) return errorResponse(invalidInputFrom(decoded.failure.issue))
  const result = await household.seedHousehold(decoded.success)
  return Response.json(result, { status: result.created ? 201 : 200, headers: noStore })
}

const caregiverRoute =
  (change: (household: AdminHousehold, email: string) => Promise<CaregiverStatus | undefined>): AdminRoute =>
  async (request, household) => {
    const decoded = decodeCaregiver(await request.text())
    if (Result.isFailure(decoded)) return errorResponse(invalidInputFrom(decoded.failure.issue))
    const status = await change(household, decoded.success.email)
    return status === undefined ? errorResponse(new NotFound()) : Response.json(status, { headers: noStore })
  }

const setEmail: AdminRoute = async (request, household) => {
  const decoded = decodeEmailChange(await request.text())
  if (Result.isFailure(decoded)) return errorResponse(invalidInputFrom(decoded.failure.issue))
  const change = await household.setCaregiverEmail(decoded.success.email, decoded.success.newEmail)
  if (change.kind === "unknown") return errorResponse(new NotFound())
  if (change.kind === "taken") return refusedField("newEmail")
  return Response.json({ email: change.email, closedSockets: change.closedSockets }, { headers: noStore })
}

const ROUTES = new Map<string, AdminRoute>([
  ["POST /api/admin/household", seed],
  ["POST /api/admin/caregiver/disable", caregiverRoute((household, email) => household.disableCaregiver(email))],
  ["POST /api/admin/caregiver/enable", caregiverRoute((household, email) => household.enableCaregiver(email))],
  ["POST /api/admin/caregiver/set-email", setEmail],
])

export const routeAdmin = async (request: Request, household: AdminHousehold): Promise<Response> => {
  const route = ROUTES.get(`${request.method} ${new URL(request.url).pathname}`)
  return route === undefined ? errorResponse(new NotFound()) : route(request, household)
}

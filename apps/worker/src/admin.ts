import { Instant, InvalidInput, invalidInputFrom, NotFound, ServiceUnavailable } from "@bt/contracts"
import { Result, Schema } from "effect"
import { errorResponse } from "./error-response.ts"
import { logOutage } from "./logs.ts"
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

export type RestoreTarget =
  | { readonly kind: "bookmark"; readonly bookmark: string }
  | { readonly kind: "time"; readonly at: number }

export interface ScheduledRestore {
  readonly bookmark: string
  readonly undo: string
}

export const RESTART_REASON = "restarting to apply a point-in-time restore"

export const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export interface AdminHousehold {
  seedHousehold(seed: HouseholdSeed): Promise<SeedResult>
  disableCaregiver(email: string): Promise<CaregiverStatus | undefined>
  enableCaregiver(email: string): Promise<CaregiverStatus | undefined>
  setCaregiverEmail(email: string, newEmail: string): Promise<EmailChangeResult>
  pitrBookmark(): Promise<string>
  pitrScheduleRestore(target: RestoreTarget): Promise<ScheduledRestore>
  restart(): Promise<void>
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

const Bookmark = Schema.String.check(Schema.isPattern(/^[0-9a-f]+(?:-[0-9a-f]+)+$/))

const RestoreRequest = Schema.Union([Schema.Struct({ bookmark: Bookmark }), Schema.Struct({ at: Instant })])

const decodeRestore = Schema.decodeUnknownResult(Schema.fromJsonString(RestoreRequest), { errors: "all" })

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

const bookmark: AdminRoute = async (_request, household) =>
  Response.json({ bookmark: await household.pitrBookmark() }, { headers: noStore })

const targetOf = (request: typeof RestoreRequest.Type): RestoreTarget =>
  "bookmark" in request ? { kind: "bookmark", bookmark: request.bookmark } : { kind: "time", at: request.at }

const recoverable = (target: RestoreTarget, now: number): boolean =>
  target.kind === "bookmark" || (target.at <= now && target.at > now - RECOVERY_WINDOW_MS)

const restarted = (household: AdminHousehold): Promise<boolean> =>
  household.restart().then(
    () => false,
    (error: Error) => error.message.includes(RESTART_REASON),
  )

const restore: AdminRoute = async (request, household) => {
  const decoded = decodeRestore(await request.text())
  if (Result.isFailure(decoded)) return errorResponse(invalidInputFrom(decoded.failure.issue))
  const target = targetOf(decoded.success)
  if (!recoverable(target, Date.now())) return refusedField("at")
  const scheduled = await household.pitrScheduleRestore(target)
  if (!(await restarted(household))) {
    logOutage("household-unavailable", "POST /api/admin/pitr/restore", "the restore is scheduled, but no restart came")
    return errorResponse(new ServiceUnavailable())
  }
  return Response.json({ restoredTo: scheduled.bookmark, undo: scheduled.undo }, { headers: noStore })
}

const ROUTES = new Map<string, AdminRoute>([
  ["POST /api/admin/household", seed],
  ["POST /api/admin/caregiver/disable", caregiverRoute((household, email) => household.disableCaregiver(email))],
  ["POST /api/admin/caregiver/enable", caregiverRoute((household, email) => household.enableCaregiver(email))],
  ["POST /api/admin/caregiver/set-email", setEmail],
  ["POST /api/admin/pitr/bookmark", bookmark],
  ["POST /api/admin/pitr/restore", restore],
])

export const routeAdmin = async (request: Request, household: AdminHousehold): Promise<Response> => {
  const route = ROUTES.get(`${request.method} ${new URL(request.url).pathname}`)
  return route === undefined ? errorResponse(new NotFound()) : route(request, household)
}

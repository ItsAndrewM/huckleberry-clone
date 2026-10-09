import { invalidInputFrom, NotFound } from "@bt/contracts"
import { Result, Schema } from "effect"
import { errorResponse } from "./error-response.ts"
import { type HouseholdSeed, HouseholdSeed as Seed, type SeedResult } from "./seed.ts"

export interface AdminHousehold {
  seedHousehold(seed: HouseholdSeed): Promise<SeedResult>
}

const decodeSeed = Schema.decodeUnknownResult(Schema.fromJsonString(Seed), { errors: "all" })

const seed = async (request: Request, household: AdminHousehold): Promise<Response> => {
  const decoded = decodeSeed(await request.text())
  if (Result.isFailure(decoded)) return errorResponse(invalidInputFrom(decoded.failure.issue))
  const result = await household.seedHousehold(decoded.success)
  return Response.json(result, { status: result.created ? 201 : 200, headers: { "cache-control": "no-store" } })
}

export const routeAdmin = async (request: Request, household: AdminHousehold): Promise<Response> => {
  const { pathname } = new URL(request.url)
  if (pathname === "/api/admin/household" && request.method === "POST") return seed(request, household)
  return errorResponse(new NotFound())
}

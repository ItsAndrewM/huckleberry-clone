import { ServiceUnavailable, Unauthorized } from "@bt/contracts"
import type { Caller } from "./access.ts"
import { type AdminHousehold, routeAdmin } from "./admin.ts"
import { errorResponse } from "./error-response.ts"

export interface Household extends AdminHousehold {
  fetch(request: Request): Promise<Response>
}

const INTERNAL_HEADER_PREFIX = "x-bt-"

const forHousehold = (request: Request, email: string): Request => {
  const headers = new Headers([...request.headers].filter(([name]) => !name.startsWith(INTERNAL_HEADER_PREFIX)))
  headers.set("x-bt-email", email)
  return new Request(request, { headers })
}

const sameOriginTarget = (url: URL): string => {
  const requested = url.searchParams.get("return") ?? "/"
  const target = requested.startsWith("/") ? URL.parse(requested, url.origin) : null
  return target?.origin === url.origin ? target.href : `${url.origin}/`
}

const loginRedirect = (url: URL): Response =>
  new Response(null, { status: 302, headers: { location: sameOriginTarget(url), "cache-control": "no-store" } })

const unavailable = () => errorResponse(new ServiceUnavailable())

const isAdmin = (caller: Caller, adminClientId: string | undefined): boolean =>
  caller.kind === "service" && adminClientId !== undefined && adminClientId !== "" && caller.clientId === adminClientId

export const routeApi = (
  request: Request,
  caller: Caller,
  household: Household,
  adminClientId: string | undefined,
): Response | Promise<Response> => {
  if (caller.kind === "keys-unavailable") return errorResponse(new ServiceUnavailable())
  if (caller.kind === "unauthenticated") return errorResponse(new Unauthorized())
  const url = new URL(request.url)
  if (url.pathname === "/api/login") return loginRedirect(url)
  if (url.pathname.startsWith("/api/admin/")) {
    return isAdmin(caller, adminClientId)
      ? routeAdmin(request, household).catch(unavailable)
      : errorResponse(new Unauthorized())
  }
  if (caller.kind === "service") return errorResponse(new Unauthorized())
  return household.fetch(forHousehold(request, caller.email)).catch(unavailable)
}

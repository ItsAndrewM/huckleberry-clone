import { SOCKET_PATH, ServiceUnavailable, Unauthorized } from "@bt/contracts"
import type { Caller } from "./access.ts"
import { type AdminHousehold, routeAdmin } from "./admin.ts"
import { errorResponse } from "./error-response.ts"
import { logForeignOrigin, logOutage, logRefusal, type Refused, routeOf } from "./logs.ts"

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

const refuse = (route: string, reason: Refused): Response => {
  logRefusal(route, reason)
  return errorResponse(new Unauthorized())
}

const unavailable = (route: string) => (error: Error) => {
  logOutage("household-unavailable", route, error.message)
  return errorResponse(new ServiceUnavailable())
}

const isAdmin = (caller: Caller, adminClientId: string | undefined): boolean =>
  caller.kind === "service" && adminClientId !== undefined && adminClientId !== "" && caller.clientId === adminClientId

const toHousehold = (request: Request, route: string, email: string, household: Household) => {
  const url = new URL(request.url)
  const origin = request.headers.get("origin")
  if (url.pathname === SOCKET_PATH && origin !== url.origin) {
    logForeignOrigin(route, origin)
    return new Response(null, { status: 403, headers: { "cache-control": "no-store" } })
  }
  return household.fetch(forHousehold(request, email)).catch(unavailable(route))
}

export const routeApi = (
  request: Request,
  caller: Caller,
  household: Household,
  adminClientId: string | undefined,
): Response | Promise<Response> => {
  const route = routeOf(request.method, request.url)
  if (caller.kind === "keys-unavailable") {
    logOutage("keys-unavailable", route, caller.cause)
    return errorResponse(new ServiceUnavailable())
  }
  if (caller.kind === "unauthenticated") return refuse(route, caller.reason)
  const url = new URL(request.url)
  if (url.pathname === "/api/login") return loginRedirect(url)
  if (url.pathname.startsWith("/api/admin/")) {
    return isAdmin(caller, adminClientId)
      ? routeAdmin(request, household).catch(unavailable(route))
      : refuse(route, "not-admin")
  }
  if (caller.kind === "service") return refuse(route, "service-token")
  return toHousehold(request, route, caller.email, household)
}

// Worker entry for the spike. Mirrors the production shape planned for M1.4:
// Access check -> header hygiene -> forward to the single household DO (D1, D5, D6).
import { resolveIdentity, stringClaim } from "./access.ts"

export { HouseholdDO } from "./household.ts"

export interface Env {
  ASSETS: Fetcher
  HOUSEHOLD: DurableObjectNamespace<import("./household.ts").HouseholdDO>
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  ADMIN_SERVICE_TOKEN_CN: string
}

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } })

/** Copies the request, dropping every client-sent `x-bt-*` header (D5). */
export const stripInternalHeaders = (request: Request): Headers => {
  const headers = new Headers(request.headers)
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith("x-bt-")) headers.delete(name)
  }
  return headers
}

/** Accepts only same-origin absolute paths; anything else becomes `/`. */
export const safeReturnPath = (raw: string | null): string => {
  if (raw === null || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/"
  return raw
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request)

    const resolved = await resolveIdentity(request, env, ctx)
    if (resolved === undefined) return json(401, { _tag: "Unauthorized" })
    const { claims } = resolved

    // Spike-only: echo exactly what Access gives us, for S2/S5 records.
    if (url.pathname === "/api/spike/identity") {
      return json(200, {
        via: resolved.via,
        hasCtxAccess: ctx.access !== undefined,
        hasJwtHeader: request.headers.has("cf-access-jwt-assertion"),
        upgrade: request.headers.get("upgrade"),
        claims,
      })
    }

    if (url.pathname === "/api/login") {
      return new Response(null, {
        status: 302,
        headers: { location: safeReturnPath(url.searchParams.get("return")), "cache-control": "no-store" },
      })
    }

    const stub = env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName("household"))

    if (url.pathname.startsWith("/api/admin/")) {
      // Service-token JWTs carry the token's Client ID as `common_name` and an empty `sub`.
      const clientId = stringClaim(claims, "common_name")
      if (clientId === undefined || env.ADMIN_SERVICE_TOKEN_CN === "" || clientId !== env.ADMIN_SERVICE_TOKEN_CN) {
        return json(403, { _tag: "Forbidden" })
      }
      if (url.pathname === "/api/admin/caregiver/disable" && request.method === "POST") {
        const { email } = await request.json<{ email: string }>()
        return json(200, { closedSockets: await stub.disableCaregiver(email) })
      }
      if (url.pathname === "/api/admin/caregiver/seed" && request.method === "POST") {
        const { id, email } = await request.json<{ id: string; email: string }>()
        await stub.seedCaregiver(id, email)
        return json(200, { seeded: email })
      }
      if (url.pathname === "/api/admin/pitr/bookmark") return json(200, await stub.pitrBookmark())
      if (url.pathname === "/api/admin/pitr/restore" && request.method === "POST") {
        const { bookmark } = await request.json<{ bookmark: string }>()
        const { undoBookmark } = await stub.pitrScheduleRestore(bookmark)
        await stub.restart().catch(() => undefined)
        return json(200, { undoBookmark, restarted: true })
      }
      return json(404, { _tag: "NotFound" })
    }

    const email = stringClaim(claims, "email")
    if (email === undefined) return json(401, { _tag: "Unauthorized" })

    const headers = stripInternalHeaders(request)
    headers.set("x-bt-email", email.toLowerCase())
    return stub.fetch(new Request(request, { headers }))
  },
} satisfies ExportedHandler<Env>

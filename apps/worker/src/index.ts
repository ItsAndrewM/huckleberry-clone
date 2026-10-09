import { callerOf, remoteAccessKeys } from "./access.ts"
import { routeApi } from "./api.ts"
import { type HouseholdDO, householdOf } from "./household.ts"

export { HouseholdDO } from "./household.ts"

interface Env {
  readonly HOUSEHOLD: DurableObjectNamespace<HouseholdDO>
  readonly ACCESS_TEAM_DOMAIN?: string
  readonly ACCESS_AUD?: string
  readonly ADMIN_SERVICE_TOKEN_CN?: string
}

export default {
  async fetch(request, env, ctx) {
    if (!new URL(request.url).pathname.startsWith("/api/")) return new Response("Not found", { status: 404 })
    const caller = await callerOf(request, ctx.access, env, remoteAccessKeys)
    return routeApi(
      request,
      caller,
      (forwarded) => householdOf(env.HOUSEHOLD).fetch(forwarded),
      env.ADMIN_SERVICE_TOKEN_CN,
    )
  },
} satisfies ExportedHandler<Env>

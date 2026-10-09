import { NotFound } from "@bt/contracts"
import { DurableObject } from "cloudflare:workers"
import { migrate } from "./db/migrate.ts"
import { MIGRATIONS } from "./db/migrations.ts"
import { errorResponse } from "./error-response.ts"

export class HouseholdDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => migrate(ctx.storage, MIGRATIONS, Date.now()))
  }

  override fetch(): Response {
    return errorResponse(new NotFound())
  }
}

export const householdOf = (namespace: DurableObjectNamespace<HouseholdDO>) => namespace.getByName("household")

import { NotFound } from "@bt/contracts"
import { DurableObject } from "cloudflare:workers"
import { Schema } from "effect"
import { seedHousehold } from "./core/household.ts"
import { migrate } from "./db/migrate.ts"
import { MIGRATIONS } from "./db/migrations.ts"
import { errorResponse } from "./error-response.ts"
import { HouseholdSeed, type SeedResult } from "./seed.ts"

interface HouseholdEnv {
  readonly LOCAL_HOUSEHOLD?: Schema.Json
}

export const startHousehold = async (
  storage: DurableObjectStorage,
  localHousehold: Schema.Json | undefined,
  now: number,
): Promise<void> => {
  migrate(storage, MIGRATIONS, now)
  if (localHousehold !== undefined) seedHousehold(storage, Schema.decodeUnknownSync(HouseholdSeed)(localHousehold), now)
}

export class HouseholdDO extends DurableObject<HouseholdEnv> {
  constructor(ctx: DurableObjectState, env: HouseholdEnv) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(() => startHousehold(ctx.storage, env.LOCAL_HOUSEHOLD, Date.now()))
  }

  override fetch(): Response {
    return errorResponse(new NotFound())
  }

  seedHousehold(seed: HouseholdSeed): SeedResult {
    return seedHousehold(this.ctx.storage, seed, Date.now())
  }
}

export const householdOf = (namespace: DurableObjectNamespace<HouseholdDO>) => namespace.getByName("household")

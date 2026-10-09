import { DurableObject } from "cloudflare:workers"
import { Schema } from "effect"
import { seedHousehold } from "./core/household.ts"
import { PRUNE_EVERY_MS, pruneReceipts } from "./core/receipts.ts"
import { migrate } from "./db/migrate.ts"
import { MIGRATIONS } from "./db/migrations.ts"
import { householdApi } from "./http.ts"
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
  if ((await storage.getAlarm()) === null) await storage.setAlarm(now + PRUNE_EVERY_MS)
}

export class HouseholdDO extends DurableObject<HouseholdEnv> {
  private readonly api: ReturnType<typeof householdApi>

  constructor(ctx: DurableObjectState, env: HouseholdEnv) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(() => startHousehold(ctx.storage, env.LOCAL_HOUSEHOLD, Date.now()))
    this.api = householdApi(ctx.storage.sql)
  }

  override async fetch(request: Request): Promise<Response> {
    const response = await this.api.handler(request)
    response.headers.set("cache-control", "no-store")
    return response
  }

  override async alarm(): Promise<void> {
    const now = Date.now()
    pruneReceipts(this.ctx.storage.sql, now)
    await this.ctx.storage.setAlarm(now + PRUNE_EVERY_MS)
  }

  seedHousehold(seed: HouseholdSeed): SeedResult {
    return seedHousehold(this.ctx.storage, seed, Date.now())
  }
}

export const householdOf = (namespace: DurableObjectNamespace<HouseholdDO>) => namespace.getByName("household")

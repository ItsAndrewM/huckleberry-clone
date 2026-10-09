import { SOCKET_PATH } from "@bt/contracts"
import { DurableObject } from "cloudflare:workers"
import { Schema } from "effect"
import type { CaregiverStatus } from "./admin.ts"
import { setCaregiverActive } from "./core/caregivers.ts"
import { seedHousehold } from "./core/household.ts"
import { PRUNE_EVERY_MS, pruneReceipts } from "./core/receipts.ts"
import { migrate } from "./db/migrate.ts"
import { MIGRATIONS } from "./db/migrations.ts"
import { householdApi } from "./http.ts"
import { HouseholdSeed, type SeedResult } from "./seed.ts"
import { acceptSocket, broadcastTo, closeSockets, heartbeat } from "./sockets.ts"

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
    ctx.setWebSocketAutoResponse(heartbeat())
    this.api = householdApi(ctx.storage, broadcastTo(ctx))
  }

  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === SOCKET_PATH) return acceptSocket(this.ctx, request)
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

  disableCaregiver(email: string): CaregiverStatus | undefined {
    const caregiverId = setCaregiverActive(this.ctx.storage.sql, email, false, Date.now())
    return caregiverId === undefined
      ? undefined
      : { email, active: false, closedSockets: closeSockets(this.ctx, caregiverId) }
  }

  enableCaregiver(email: string): CaregiverStatus | undefined {
    const caregiverId = setCaregiverActive(this.ctx.storage.sql, email, true, Date.now())
    return caregiverId === undefined ? undefined : { email, active: true, closedSockets: 0 }
  }
}

export const householdOf = (namespace: DurableObjectNamespace<HouseholdDO>) => namespace.getByName("household")

import { type HouseholdExport, SOCKET_PATH } from "@bt/contracts"
import { DurableObject } from "cloudflare:workers"
import { Option, Schema } from "effect"
import {
  type CaregiverStatus,
  type EmailChangeResult,
  RESTART_REASON,
  type RestoreTarget,
  type ScheduledRestore,
} from "./admin.ts"
import { activeCaregiver, setCaregiverActive, setCaregiverEmail } from "./core/caregivers.ts"
import { householdExportOf } from "./core/export.ts"
import { seedHousehold } from "./core/household.ts"
import { PRUNE_EVERY_MS, pruneReceipts } from "./core/receipts.ts"
import { migrate } from "./db/migrate.ts"
import { MIGRATIONS } from "./db/migrations.ts"
import { householdApi } from "./http.ts"
import { type DefectContext, logDefect, routeOf } from "./logs.ts"
import { HouseholdSeed, type SeedResult } from "./seed.ts"
import { acceptSocket, answerClose, broadcastTo, closeSockets, heartbeat } from "./sockets.ts"

interface HouseholdEnv {
  readonly LOCAL_HOUSEHOLD?: Schema.Json
}

const actionIdOf = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ actionId: Schema.String })))

const defectContext = async (sql: SqlStorage, request: Request): Promise<DefectContext> => ({
  route: routeOf(request.method, request.url),
  caregiverId: activeCaregiver(sql, request.headers.get("x-bt-email") ?? undefined)?.id ?? null,
  actionId: Option.getOrNull(Option.map(actionIdOf(await request.text()), ({ actionId }) => actionId)),
})

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
    const copy = request.clone()
    const response = await this.api.handler(request)
    if (response.status === 500) logDefect(await defectContext(this.ctx.storage.sql, copy))
    response.headers.set("cache-control", "no-store")
    return response
  }

  override webSocketClose(socket: WebSocket, code: number, reason: string): void {
    answerClose(socket, code, reason)
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

  setCaregiverEmail(email: string, newEmail: string): EmailChangeResult {
    const change = setCaregiverEmail(this.ctx.storage.sql, email, newEmail, Date.now())
    return change.kind === "changed"
      ? { kind: "changed", email: newEmail, closedSockets: closeSockets(this.ctx, change.caregiverId) }
      : change
  }

  pitrBookmark(): Promise<string> {
    return this.ctx.storage.getCurrentBookmark()
  }

  async pitrScheduleRestore(target: RestoreTarget): Promise<ScheduledRestore> {
    const bookmark = target.kind === "bookmark" ? target.bookmark : await this.ctx.storage.getBookmarkForTime(target.at)
    return { bookmark, undo: await this.ctx.storage.onNextSessionRestoreBookmark(bookmark) }
  }

  restart(): void {
    this.ctx.abort(RESTART_REASON)
  }

  exportHousehold(): HouseholdExport {
    return householdExportOf(this.ctx.storage.sql, Date.now())
  }
}

export const householdOf = (namespace: DurableObjectNamespace<HouseholdDO>) => namespace.getByName("household")

// HouseholdDO for the spike. Exercises S6 (Effect http-api + @effect/sql-sqlite-do
// with a transactionSync core, D2), S7 (hibernatable sockets tagged by caregiver)
// and S8 (point-in-time recovery bookmarks).
import { SqliteClient } from "@effect/sql-sqlite-do"
import { DurableObject } from "cloudflare:workers"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { SqlClient } from "effect/sql"
import type { Env } from "./index.ts"

// ---------------------------------------------------------------------------
// Contracts (would live in packages/contracts)

class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}
class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { code: Schema.String, current: Schema.Number },
  { httpApiStatus: 409 },
) {}

const Me = Schema.Struct({ email: Schema.String, caregiverId: Schema.String })
const Counter = Schema.Struct({ value: Schema.Number, version: Schema.Number })
const IncrementPayload = Schema.Struct({
  actionId: Schema.String,
  version: Schema.optional(Schema.Number),
  failAfterWrite: Schema.optional(Schema.Boolean),
})

class SpikeGroup extends HttpApiGroup.make("spike")
  .add(
    HttpApiEndpoint.get("me", "/me", { success: Me, error: Unauthorized }),
    HttpApiEndpoint.get("counter", "/spike/counter", { success: Counter, error: Unauthorized }),
    HttpApiEndpoint.post("increment", "/spike/increment", {
      payload: IncrementPayload,
      success: Counter,
      error: [Unauthorized, Conflict],
    }),
  )
  .prefix("/api") {}

class Api extends HttpApi.make("bt-spike").add(SpikeGroup) {}

// ---------------------------------------------------------------------------
// Synchronous core (D2). No awaits, no Effect: read, check, write.

type Sql = SqlStorage

const MIGRATIONS: ReadonlyArray<string> = [
  `CREATE TABLE caregivers (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, active INTEGER NOT NULL);
   CREATE TABLE counter (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL, version INTEGER NOT NULL);
   INSERT INTO counter (id, value, version) VALUES (1, 0, 1);
   CREATE TABLE receipts (action_id TEXT PRIMARY KEY, response TEXT NOT NULL, created_at INTEGER NOT NULL);`,
]

const migrate = (sql: Sql) => {
  sql.exec("CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)")
  const applied = sql.exec<{ n: number }>("SELECT count(*) AS n FROM _migrations").one().n
  MIGRATIONS.slice(applied).forEach((ddl, i) => {
    sql.exec(ddl)
    sql.exec("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)", applied + i + 1, Date.now())
  })
}

type Counter = typeof Counter.Type
type IncrementResult = { ok: true; counter: Counter } | { ok: false; current: number }

class Rollback extends Error {}

const incrementCore = (
  storage: DurableObjectStorage,
  input: typeof IncrementPayload.Type,
): IncrementResult =>
  storage.transactionSync(() => {
    const sql = storage.sql
    const receipt = sql.exec<{ response: string }>("SELECT response FROM receipts WHERE action_id = ?", input.actionId).toArray()[0]
    if (receipt !== undefined) return { ok: true, counter: JSON.parse(receipt.response) as Counter }

    const row = sql.exec<{ value: number; version: number }>("SELECT value, version FROM counter WHERE id = 1").one()
    if (input.version !== undefined && input.version !== row.version) return { ok: false, current: row.version }

    // Deliberate read-modify-write: only correct if nothing interleaves.
    const counter = { value: row.value + 1, version: row.version + 1 }
    sql.exec("UPDATE counter SET value = ?, version = ? WHERE id = 1", counter.value, counter.version)
    if (input.failAfterWrite === true) throw new Rollback("forced failure after write")
    sql.exec("INSERT INTO receipts (action_id, response, created_at) VALUES (?, ?, ?)", input.actionId, JSON.stringify(counter), Date.now())
    return { ok: true, counter }
  })

const caregiverFor = (sql: Sql, email: string | undefined) => {
  if (email === undefined) return undefined
  const row = sql.exec<{ id: string; active: number }>("SELECT id, active FROM caregivers WHERE email = ?", email).toArray()[0]
  return row !== undefined && row.active === 1 ? { id: row.id, email } : undefined
}

// ---------------------------------------------------------------------------
// Effect edge

const makeHandler = (storage: DurableObjectStorage) => {
  const Handlers = HttpApiBuilder.group(
    Api,
    "spike",
    Effect.fn(function* (handlers) {
      const sqlClient = yield* SqlClient.SqlClient

      // D5: identity resolved in the DO on every request.
      const currentCaregiver = Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const caregiver = caregiverFor(storage.sql, request.headers["x-bt-email"])
        if (caregiver === undefined) return yield* new Unauthorized()
        return caregiver
      })

      return handlers.handleAll({
        me: () => currentCaregiver.pipe(Effect.map((c) => ({ email: c.email, caregiverId: c.id }))),

        // Reads go through @effect/sql-sqlite-do, to prove it coexists with transactionSync.
        counter: () =>
          Effect.gen(function* () {
            yield* currentCaregiver
            const rows = yield* sqlClient<{ value: number; version: number }>`SELECT value, version FROM counter WHERE id = 1`
            return rows[0]!
          }).pipe(Effect.orDie),

        increment: ({ payload }) =>
          Effect.gen(function* () {
            yield* currentCaregiver
            // Synchronous core inside Effect.sync: the whole transaction runs in one
            // turn of the event loop, whatever the HTTP layer does around it.
            // A throw rolls the transaction back and surfaces as a defect (500).
            const result = yield* Effect.sync(() => incrementCore(storage, payload))
            if (!result.ok) return yield* new Conflict({ code: "STALE_VERSION", current: result.current })
            return result.counter
          }),
      })
    }),
  )

  const routes = HttpApiBuilder.layer(Api).pipe(
    Layer.provide(Handlers),
    Layer.provide(SqliteClient.layer({ storage })),
    Layer.provide(HttpServer.layerServices),
  )
  return HttpRouter.toWebHandler(routes, { disableLogger: true })
}

// ---------------------------------------------------------------------------

export class HouseholdDO extends DurableObject<Env> {
  private readonly web: ReturnType<typeof makeHandler>
  // Changes on every constructor run, so tests can tell a woken instance from the original.
  private readonly instanceId = crypto.randomUUID()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => migrate(ctx.storage.sql))
    this.web = makeHandler(ctx.storage)
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/api/ws") return this.acceptSocket(request)
    if (url.pathname === "/api/spike/sockets") {
      const tag = url.searchParams.get("tag") ?? undefined
      return Response.json({ count: this.ctx.getWebSockets(tag).length })
    }
    return this.web.handler(request)
  }

  // S7: hibernatable socket, tagged by caregiver id.
  private acceptSocket(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 })
    const caregiver = caregiverFor(this.ctx.storage.sql, request.headers.get("x-bt-email") ?? undefined)
    if (caregiver === undefined) return Response.json({ _tag: "Unauthorized" }, { status: 401 })
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server, [`caregiver:${caregiver.id}`])
    server.serializeAttachment({ caregiverId: caregiver.id, email: caregiver.email, connectedAt: Date.now() })
    return new Response(null, { status: 101, webSocket: client })
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Echo with the attachment, so a client can confirm state survived hibernation.
    ws.send(
      JSON.stringify({
        echo: typeof message === "string" ? message : "<binary>",
        attachment: ws.deserializeAttachment(),
        instanceId: this.instanceId,
      }),
    )
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    ws.close(code, "closing")
  }

  // --- RPC (D6 admin, test seeding) ---------------------------------------

  seedCaregiver(id: string, email: string, active = true): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO caregivers (id, email, active) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET active = excluded.active",
      id,
      email.toLowerCase(),
      active ? 1 : 0,
    )
  }

  disableCaregiver(email: string): number {
    const row = this.ctx.storage.sql
      .exec<{ id: string }>("UPDATE caregivers SET active = 0 WHERE email = ? RETURNING id", email.toLowerCase())
      .toArray()[0]
    if (row === undefined) return 0
    const sockets = this.ctx.getWebSockets(`caregiver:${row.id}`)
    for (const ws of sockets) ws.close(4401, "caregiver disabled")
    return sockets.length
  }

  // S8: point-in-time recovery.
  async pitrBookmark(): Promise<{
    bookmark: string
    counter: { value: number; version: number }
    caregivers: Array<{ id: string; email: string; active: boolean }>
  }> {
    const bookmark = await this.ctx.storage.getCurrentBookmark()
    const sql = this.ctx.storage.sql
    const counter = sql.exec<{ value: number; version: number }>("SELECT value, version FROM counter WHERE id = 1").one()
    const caregivers = sql
      .exec<{ id: string; email: string; active: number }>("SELECT id, email, active FROM caregivers ORDER BY id")
      .toArray()
      .map((c) => ({ id: c.id, email: c.email, active: c.active === 1 }))
    return { bookmark, counter: { value: counter.value, version: counter.version }, caregivers }
  }

  async pitrScheduleRestore(bookmark: string): Promise<{ undoBookmark: string }> {
    return { undoBookmark: await this.ctx.storage.onNextSessionRestoreBookmark(bookmark) }
  }

  // The restore applies on the next session start; abort() throws to the caller by design.
  restart(): void {
    this.ctx.abort("restart to apply PITR restore")
  }
}

import { env, evictDurableObject, reset, runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { HouseholdDO } from "../src/household.ts"
import worker, { safeReturnPath } from "../src/index.ts"

const BASE = "https://bt.example.test"
const stub = () => env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName("household"))

// Calls the DO directly, bypassing Access, with the header the Worker would set.
const asCaregiver = (email: string, path: string, init: RequestInit = {}) =>
  stub().fetch(`${BASE}${path}`, { ...init, headers: { ...init.headers, "x-bt-email": email } })

const increment = (email: string, body: object) =>
  asCaregiver(email, "/api/spike/increment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(async () => {
  await reset()
  await stub().seedCaregiver("cg-andrew", "andrew@example.test")
  await stub().seedCaregiver("cg-emily", "emily@example.test")
})

// The test pool does not apply wrangler's `access.dev` stub (it does under
// `wrangler dev`; see spike-results.md S5), so the Worker is driven directly
// with an explicit `ctx.access`.
const withAccess = (identity: CloudflareAccessIdentity | undefined) =>
  ({
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
    access: identity === undefined ? undefined : { aud: "test-aud", getIdentity: async () => identity },
  }) as unknown as ExecutionContext

const call = (path: string, identity: CloudflareAccessIdentity | undefined, init: RequestInit = {}, envOverride = {}) =>
  worker.fetch(new Request(`${BASE}${path}`, init) as Request<unknown, IncomingRequestCfProperties>, { ...env, ...envOverride }, withAccess(identity))

const ANDREW = { email: "Andrew@Example.test" }

describe("S5 Worker entry: Access check, header hygiene, admin gate", () => {
  it("no ctx.access -> 401 on /api/*, but the shell is still served", async () => {
    expect((await call("/api/me", undefined)).status).toBe(401)
    expect((await call("/some/client/route", undefined)).status).toBe(200)
    expect(await (await call("/", undefined)).text()).toContain("<title>BT spike</title>")
  })

  it("passes the verified identity through to the DO (lower-cased)", async () => {
    const res = await call("/api/me", ANDREW)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: "andrew@example.test", caregiverId: "cg-andrew" })
  })

  it("strips a spoofed x-bt-email header", async () => {
    const res = await call("/api/me", ANDREW, { headers: { "x-bt-email": "emily@example.test", "X-BT-Other": "1" } })
    expect(await res.json()).toMatchObject({ email: "andrew@example.test" })
  })

  it("an authenticated but unknown email gets no data", async () => {
    expect((await call("/api/me", { email: "stranger@example.test" })).status).toBe(401)
  })

  it("/api/admin/* rejects caregiver identities and accepts only the configured service token", async () => {
    const admin = { ADMIN_SERVICE_TOKEN_CN: "bt-admin.access" }
    expect((await call("/api/admin/pitr/bookmark", ANDREW, {}, admin)).status).toBe(403)
    expect((await call("/api/admin/pitr/bookmark", { common_name: "other.access" }, {}, admin)).status).toBe(403)
    expect((await call("/api/admin/pitr/bookmark", { common_name: "bt-admin.access" })).status).toBe(403) // unset CN fails closed
    const ok = await call("/api/admin/caregiver/disable", { common_name: "bt-admin.access" }, {
      method: "POST",
      body: JSON.stringify({ email: "emily@example.test" }),
    }, admin)
    expect(ok.status).toBe(200)
    expect((await asCaregiver("emily@example.test", "/api/me")).status).toBe(401)
  })

  it("redirects /api/login only to same-origin paths", async () => {
    const res = await call("/api/login?return=/history", ANDREW, { redirect: "manual" })
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("/history")
    for (const bad of ["https://evil.test/", "//evil.test", "/\\evil.test", "history", null]) expect(safeReturnPath(bad)).toBe("/")
  })
})

describe("S6 Effect http-api + sql-sqlite-do + transactionSync (D2)", () => {
  it("unknown or disabled caregiver gets 401", async () => {
    expect((await asCaregiver("stranger@example.test", "/api/me")).status).toBe(401)
    await stub().disableCaregiver("emily@example.test")
    expect((await asCaregiver("emily@example.test", "/api/me")).status).toBe(401)
  })

  it("serializes 50 concurrent read-modify-write increments", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => increment(i % 2 ? "andrew@example.test" : "emily@example.test", { actionId: `a${i}` })),
    )
    expect(results.map((r: Response) => r.status)).toEqual(Array(50).fill(200))
    const counter = await (await asCaregiver("andrew@example.test", "/api/spike/counter")).json()
    expect(counter).toEqual({ value: 50, version: 51 })
  })

  it("two writers on the same version: one wins, one gets 409 STALE_VERSION (AC 13 shape)", async () => {
    const [a, b] = await Promise.all([
      increment("andrew@example.test", { actionId: "x1", version: 1 }),
      increment("emily@example.test", { actionId: "x2", version: 1 }),
    ])
    expect([a!.status, b!.status].sort()).toEqual([200, 409])
    const loser = [a!, b!].find((r: Response) => r.status === 409)!
    expect(await loser.json()).toMatchObject({ _tag: "Conflict", code: "STALE_VERSION", current: 2 })
  })

  it("replaying an actionId returns the stored response without writing again (AC 14 shape)", async () => {
    const first = await (await increment("andrew@example.test", { actionId: "same" })).json()
    const second = await (await increment("andrew@example.test", { actionId: "same" })).json()
    expect(second).toEqual(first)
    expect(await (await asCaregiver("andrew@example.test", "/api/spike/counter")).json()).toEqual({ value: 1, version: 2 })
  })

  it("a throw inside transactionSync rolls back the write and the receipt", async () => {
    const res = await increment("andrew@example.test", { actionId: "boom", failAfterWrite: true })
    expect(res.status).toBe(500)
    await runInDurableObject(stub(), (_instance: HouseholdDO, state) => {
      expect(state.storage.sql.exec("SELECT value FROM counter").one().value).toBe(0)
      expect(state.storage.sql.exec("SELECT count(*) AS n FROM receipts").one().n).toBe(0)
    })
  })

  it("decodes payloads at the edge (400 on bad input)", async () => {
    const res = await increment("andrew@example.test", { actionId: 42 })
    expect(res.status).toBe(400)
  })
})

describe("S7 hibernatable sockets tagged by caregiver", () => {
  const open = async (email: string) => {
    const res = await asCaregiver(email, "/api/ws", { headers: { upgrade: "websocket" } })
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    ws.accept()
    return ws
  }

  const nextMessage = (ws: WebSocket) =>
    new Promise<unknown>((resolve) => ws.addEventListener("message", (e) => resolve(JSON.parse(e.data as string)), { once: true }))

  const closed = (ws: WebSocket) =>
    new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code), { once: true }))

  it("keeps the attachment and tags, and closes only the disabled caregiver's sockets", async () => {
    const andrew1 = await open("andrew@example.test")
    const andrew2 = await open("andrew@example.test")
    const emily = await open("emily@example.test")

    const reply = nextMessage(andrew1)
    andrew1.send("ping")
    expect(await reply).toMatchObject({ echo: "ping", attachment: { caregiverId: "cg-andrew" } })

    const counts = async (tag: string) =>
      (await (await asCaregiver("emily@example.test", `/api/spike/sockets?tag=${tag}`)).json<{ count: number }>()).count
    expect(await counts("caregiver:cg-andrew")).toBe(2)
    expect(await counts("caregiver:cg-emily")).toBe(1)

    const andrewClosed = Promise.all([closed(andrew1), closed(andrew2)])
    expect(await stub().disableCaregiver("andrew@example.test")).toBe(2)
    expect(await andrewClosed).toEqual([4401, 4401])

    const emilyReply = nextMessage(emily)
    emily.send("still here")
    expect(await emilyReply).toMatchObject({ echo: "still here" })
    emily.close()
  })

  it("tags and attachments survive hibernation; a woken instance can still close by caregiver", async () => {
    const andrew = await open("andrew@example.test")
    const emily = await open("emily@example.test")

    const before = nextMessage(andrew)
    andrew.send("before")
    const { instanceId: original } = (await before) as { instanceId: string }

    await evictDurableObject(stub()) // hibernates sockets, tears down the instance

    const after = nextMessage(andrew)
    andrew.send("after")
    const woken = (await after) as { instanceId: string; attachment: { caregiverId: string } }
    expect(woken.instanceId).not.toBe(original)
    expect(woken.attachment.caregiverId).toBe("cg-andrew")

    const andrewClosed = closed(andrew)
    expect(await stub().disableCaregiver("andrew@example.test")).toBe(1)
    expect(await andrewClosed).toBe(4401)
    emily.close()
  })

  it("socket counts require an active caregiver", async () => {
    expect((await asCaregiver("stranger@example.test", "/api/spike/sockets")).status).toBe(401)
    expect((await stub().fetch(`${BASE}/api/spike/sockets`)).status).toBe(401)
    expect((await asCaregiver("emily@example.test", "/api/spike/sockets")).status).toBe(200)
    await stub().disableCaregiver("emily@example.test")
    expect((await asCaregiver("emily@example.test", "/api/spike/sockets")).status).toBe(401)
  })

  it("rejects a socket for an unknown caregiver", async () => {
    const res = await asCaregiver("stranger@example.test", "/api/ws", { headers: { upgrade: "websocket" } })
    expect(res.status).toBe(401)
  })
})

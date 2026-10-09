import { ChangedMessage, HEARTBEAT, SavedDiaper, SavedFeed } from "@bt/contracts"
import { evictDurableObject, runInDurableObject } from "cloudflare:test"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { HouseholdDO } from "../src/household.ts"
import { ANDREW, EMILY, seededHousehold } from "./fixtures.ts"

const ORIGIN = "https://bt.example.test"
const NOW = Date.UTC(2026, 9, 8, 19)
const HOUR_MS = 3_600_000

type Household = DurableObjectStub<HouseholdDO>

const decodeMessage = Schema.decodeUnknownSync(Schema.fromJsonString(ChangedMessage))
const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedDiaper))
const decodeSavedFeed = Schema.decodeUnknownSync(Schema.toCodecJson(SavedFeed))

const upgrade = (household: Household, headers: Record<string, string>) =>
  household.fetch(`${ORIGIN}/api/ws`, { headers })

const connect = async (household: Household, email: string) => {
  const response = await upgrade(household, { upgrade: "websocket", "x-bt-email": email })
  expect(response.status).toBe(101)
  const socket = response.webSocket
  if (socket === null) throw new Error("the household answered 101 without a socket")
  socket.accept()
  return socket
}

const nextMessage = (socket: WebSocket) =>
  new Promise<string>((resolve) => {
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true })
  })

const closed = (socket: WebSocket) =>
  new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason }), { once: true })
  })

const wetAt = (occurredAt: number, actionId: string = crypto.randomUUID()) => ({
  actionId,
  occurredAt,
  wet: true,
  dirty: false,
})

const post = async (household: Household, path: string, body: Schema.Json, email = ANDREW.email) => {
  const response = await household.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bt-email": email },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const logDiaper = async (household: Household, body = wetAt(NOW - HOUR_MS), email = ANDREW.email) => {
  const { status, body: saved } = await post(household, "/api/diapers", body, email)
  expect(status).toBe(201)
  return decodeSaved(saved)
}

const caregiverId = (household: Household, email: string) =>
  runInDurableObject(
    household,
    (_instance, state) =>
      state.storage.sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", email).one().id,
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("GET /api/ws", () => {
  it("accepts an active caregiver's socket, no-store, tagged with their caregiver id", async () => {
    const household = await seededHousehold()
    const response = await upgrade(household, { upgrade: "websocket", "x-bt-email": ANDREW.email })
    expect(response.status).toBe(101)
    expect(response.headers.get("cache-control")).toBe("no-store")
    response.webSocket?.accept()
    const andrew = await caregiverId(household, ANDREW.email)
    const tagged = await runInDurableObject(household, (_instance, state) => ({
      andrew: state.getWebSockets(`caregiver:${andrew}`).length,
      all: state.getWebSockets().length,
    }))
    expect(tagged).toEqual({ andrew: 1, all: 1 })
  })

  it.each([
    ["an email that isn't a caregiver", { "x-bt-email": "stranger@example.test" }],
    ["no x-bt-email at all", {}],
  ])("refuses %s with 401, before looking at the upgrade", async (_label, identity) => {
    const household = await seededHousehold()
    for (const headers of [{ ...identity, upgrade: "websocket" }, identity]) {
      const response = await upgrade(household, headers)
      expect(response.status).toBe(401)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toEqual({ _tag: "Unauthorized" })
    }
  })

  it("refuses a caregiver from the next upgrade after they're disabled (AC 10)", async () => {
    const household = await seededHousehold()
    await connect(household, ANDREW.email)
    await runInDurableObject(household, (_instance, state) => {
      state.storage.sql.exec("UPDATE caregivers SET active = 0 WHERE email = ?", ANDREW.email)
    })
    expect((await upgrade(household, { upgrade: "websocket", "x-bt-email": ANDREW.email })).status).toBe(401)
  })

  it("answers a caregiver's request without an upgrade with 426, naming the upgrade it needs", async () => {
    const response = await upgrade(await seededHousehold(), { "x-bt-email": ANDREW.email })
    expect(response.status).toBe(426)
    expect(response.headers.get("upgrade")).toBe("websocket")
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("answers the heartbeat itself, without waking the household", async () => {
    const household = await seededHousehold()
    const socket = await connect(household, ANDREW.email)
    const pong = nextMessage(socket)
    socket.send(HEARTBEAT.ping)
    expect(await pong).toBe(HEARTBEAT.pong)
    const answered = await runInDurableObject(household, (_instance, state) =>
      state.getWebSockets().map((server) => state.getWebSocketAutoResponseTimestamp(server) !== null),
    )
    expect(answered).toEqual([true])
  })

  it("ignores anything else a client sends, and keeps the socket open", async () => {
    const household = await seededHousehold()
    const socket = await connect(household, ANDREW.email)
    socket.send("hello")
    const message = nextMessage(socket)
    const { changed } = await logDiaper(household)
    expect(decodeMessage(await message)).toEqual({ changed })
  })
})

describe("broadcasting what a change changed", () => {
  it("tells every open socket, the caller's own included, the keys a saved change changed", async () => {
    const household = await seededHousehold()
    const sockets = [await connect(household, ANDREW.email), await connect(household, EMILY.email)]
    const messages = sockets.map(nextMessage)
    const { changed } = await logDiaper(household)
    expect((await Promise.all(messages)).map((message) => decodeMessage(message))).toEqual([{ changed }, { changed }])
  })

  it("tells them again when a retry whose answer was lost is replayed (AC 14)", async () => {
    const household = await seededHousehold()
    const socket = await connect(household, EMILY.email)
    const save = wetAt(NOW - HOUR_MS)
    const first = nextMessage(socket)
    const { changed } = await logDiaper(household, save)
    expect(decodeMessage(await first)).toEqual({ changed })
    const again = nextMessage(socket)
    expect((await post(household, "/api/diapers", save)).status).toBe(201)
    expect(decodeMessage(await again)).toEqual({ changed })
  })

  it("covers the feed endpoints too", async () => {
    const household = await seededHousehold()
    const socket = await connect(household, EMILY.email)
    const message = nextMessage(socket)
    const started = await post(household, "/api/feeds/start", {
      actionId: crypto.randomUUID(),
      side: "left",
      startedAt: NOW,
    })
    expect(started.status).toBe(201)
    expect(decodeMessage(await message)).toEqual({ changed: decodeSavedFeed(started.body).changed })
  })

  it("says nothing about a change it refused", async () => {
    const household = await seededHousehold()
    const socket = await connect(household, EMILY.email)
    const message = nextMessage(socket)
    const save = wetAt(NOW - HOUR_MS)
    const { changed } = await logDiaper(household, save)
    expect(decodeMessage(await message)).toEqual({ changed })
    const next = nextMessage(socket)
    const refusals = [
      await post(household, "/api/diapers", wetAt(NOW + HOUR_MS)),
      await post(household, "/api/diapers", { ...save, dirty: true }),
      await post(household, "/api/feeds/start", { actionId: save.actionId, side: "left", startedAt: NOW }),
    ]
    expect(refusals.map(({ status }) => status)).toEqual([400, 409, 400])
    const later = await logDiaper(household, wetAt(NOW - 2 * HOUR_MS))
    expect(decodeMessage(await next)).toEqual({ changed: later.changed })
  })

  it("keeps saving, and keeps telling the others, after a socket has gone", async () => {
    const household = await seededHousehold()
    const gone = await connect(household, ANDREW.email)
    const staying = await connect(household, EMILY.email)
    const goneClosed = closed(gone)
    gone.close(1000, "app closed")
    await goneClosed
    const message = nextMessage(staying)
    const { changed } = await logDiaper(household)
    expect(decodeMessage(await message)).toEqual({ changed })
  })

  it("reaches a socket accepted before the household was evicted", async () => {
    const household = await seededHousehold()
    const socket = await connect(household, EMILY.email)
    await evictDurableObject(household)
    const message = nextMessage(socket)
    const { changed } = await logDiaper(household)
    expect(decodeMessage(await message)).toEqual({ changed })
  })
})

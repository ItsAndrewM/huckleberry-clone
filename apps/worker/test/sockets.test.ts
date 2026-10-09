import { CAREGIVER_DISABLED, ChangedMessage, HEARTBEAT, SavedDiaper, SavedFeed } from "@bt/contracts"
import { evictDurableObject, runInDurableObject } from "cloudflare:test"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, caregiverId, EMILY, HOUR_MS, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, inStorage, ORIGIN, sendJson } from "./requests.ts"

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

const logDiaper = async (household: Household, body = wetAt(NOW - HOUR_MS), email = ANDREW.email) => {
  const { status, body: saved } = await sendJson(household, "POST", "/api/diapers", body, email)
  expect(status).toBe(201)
  return decodeSaved(saved)
}

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
    const andrew = await inStorage(household, (sql) => caregiverId(sql, ANDREW.email))
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
    expect((await sendJson(household, "POST", "/api/diapers", save)).status).toBe(201)
    expect(decodeMessage(await again)).toEqual({ changed })
  })

  it("covers the feed endpoints too", async () => {
    const household = await seededHousehold()
    const socket = await connect(household, EMILY.email)
    const message = nextMessage(socket)
    const started = await sendJson(household, "POST", "/api/feeds/start", {
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
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const refusals = [
      await sendJson(household, "POST", "/api/diapers", wetAt(NOW + HOUR_MS)),
      await sendJson(household, "POST", "/api/diapers", { ...save, dirty: true }),
      await sendJson(household, "POST", "/api/feeds/start", { actionId: save.actionId, side: "left", startedAt: NOW }),
    ]
    expect(refusals.map(({ status }) => status)).toEqual([400, 409, 400])
    expect(consoleWarn).toHaveBeenCalledOnce()
    const dayBefore = await logDiaper(household, wetAt(NOW - 24 * HOUR_MS))
    expect(decodeMessage(await next)).toEqual({ changed: dayBefore.changed })
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

describe("a client closing its socket", () => {
  it.each([
    ["with its code and reason", (socket: WebSocket) => socket.close(1000, "app closed"), 1000, "app closed"],
    ["with an app's own code", (socket: WebSocket) => socket.close(4000, "stale"), 4000, "stale"],
    ["with no code", (socket: WebSocket) => socket.close(), 1005, ""],
  ])("completes the close handshake %s, and the household lets the socket go", async (_label, close, code, reason) => {
    const household = await seededHousehold()
    const socket = await connect(household, ANDREW.email)
    const socketClosed = closed(socket)
    close(socket)
    expect(await socketClosed).toEqual({ code, reason })
    expect(await runInDurableObject(household, (_instance, state) => state.getWebSockets().length)).toBe(0)
  })
})

describe("disabling and enabling a caregiver (D6)", () => {
  it("closes every socket of a disabled caregiver with 4401, and only theirs (AC 10)", async () => {
    const household = await seededHousehold()
    const andrews = [await connect(household, ANDREW.email), await connect(household, ANDREW.email)]
    const emily = await connect(household, EMILY.email)
    const andrewsClosed = Promise.all(andrews.map(closed))
    expect(await household.disableCaregiver(ANDREW.email)).toEqual({
      email: ANDREW.email,
      active: false,
      closedSockets: 2,
    })
    expect(await andrewsClosed).toEqual([CAREGIVER_DISABLED, CAREGIVER_DISABLED])
    const message = nextMessage(emily)
    const { changed } = await logDiaper(household, wetAt(NOW - HOUR_MS), EMILY.email)
    expect(decodeMessage(await message)).toEqual({ changed })
  })

  it("refuses a disabled caregiver's requests and upgrades, until they're enabled again", async () => {
    const household = await seededHousehold()
    await household.disableCaregiver(ANDREW.email)
    const me = () => get(household, "/api/me", ANDREW.email)
    expect((await me()).status).toBe(401)
    expect((await upgrade(household, { upgrade: "websocket", "x-bt-email": ANDREW.email })).status).toBe(401)
    expect(await household.enableCaregiver(ANDREW.email)).toEqual({
      email: ANDREW.email,
      active: true,
      closedSockets: 0,
    })
    expect((await me()).status).toBe(200)
    await connect(household, ANDREW.email)
  })

  it("stamps the caregiver's updated_at", async () => {
    const household = await seededHousehold()
    vi.setSystemTime(NOW + HOUR_MS)
    await household.disableCaregiver(EMILY.email)
    const stored = await runInDurableObject(household, (_instance, state) =>
      state.storage.sql.exec("SELECT email, active, updated_at FROM caregivers ORDER BY email").toArray(),
    )
    expect(stored).toEqual([
      { email: ANDREW.email, active: 1, updated_at: NOW },
      { email: EMILY.email, active: 0, updated_at: NOW + HOUR_MS },
    ])
  })

  it("answers undefined for an email that isn't a caregiver, and changes nothing", async () => {
    const household = await seededHousehold()
    expect(await household.disableCaregiver("stranger@example.test")).toBeUndefined()
    expect(await household.enableCaregiver("stranger@example.test")).toBeUndefined()
  })

  it("lets the other parent save right after a disable, while the disabled phone hasn't answered the close", async () => {
    const household = await seededHousehold()
    const neverAnswers = await upgrade(household, { upgrade: "websocket", "x-bt-email": ANDREW.email })
    expect(neverAnswers.status).toBe(101)
    const emily = await connect(household, EMILY.email)
    expect(await household.disableCaregiver(ANDREW.email)).toMatchObject({ closedSockets: 1 })
    const message = nextMessage(emily)
    const { changed } = await logDiaper(household, wetAt(NOW - HOUR_MS), EMILY.email)
    expect(decodeMessage(await message)).toEqual({ changed })
  })

  it("counts only the sockets it closes, so disabling again closes nothing more", async () => {
    const household = await seededHousehold()
    const neverAnswers = await upgrade(household, { upgrade: "websocket", "x-bt-email": ANDREW.email })
    expect(neverAnswers.status).toBe(101)
    expect(await household.disableCaregiver(ANDREW.email)).toMatchObject({ closedSockets: 1 })
    expect(await household.disableCaregiver(ANDREW.email)).toMatchObject({ closedSockets: 0 })
  })

  it("closes a caregiver's sockets from an instance woken after eviction", async () => {
    const household = await seededHousehold()
    const andrew = await connect(household, ANDREW.email)
    await evictDurableObject(household)
    const andrewClosed = closed(andrew)
    expect(await household.disableCaregiver(ANDREW.email)).toMatchObject({ closedSockets: 1 })
    expect(await andrewClosed).toEqual(CAREGIVER_DISABLED)
  })
})

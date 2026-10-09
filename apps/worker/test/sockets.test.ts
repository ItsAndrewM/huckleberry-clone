import { HEARTBEAT } from "@bt/contracts"
import { runInDurableObject } from "cloudflare:test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { HouseholdDO } from "../src/household.ts"
import { ANDREW, seededHousehold } from "./fixtures.ts"

const ORIGIN = "https://bt.example.test"
const NOW = Date.UTC(2026, 9, 8, 19)

type Household = DurableObjectStub<HouseholdDO>

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
})

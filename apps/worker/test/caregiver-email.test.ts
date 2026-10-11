import { CAREGIVER_DISABLED } from "@bt/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ANDREW, caregiverId, EMILY, HOUR_MS, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, inStorage, ORIGIN } from "./requests.ts"

const NEW_EMAIL = "emily.new@example.test"

const connect = async (household: Household, email: string) => {
  const response = await household.fetch(`${ORIGIN}/api/ws`, { headers: { upgrade: "websocket", "x-bt-email": email } })
  const socket = response.webSocket
  if (socket === null) throw new Error("the household answered without a socket")
  socket.accept()
  return socket
}

const closed = (socket: WebSocket) =>
  new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason }), { once: true })
  })

const caregiverIdOf = (household: Household, email: string) => inStorage(household, (sql) => caregiverId(sql, email))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("changing a caregiver's email (pnpm admin caregiver:set-email)", () => {
  it("moves the caregiver to the new email, keeping their id, so their entries stay theirs", async () => {
    const household = await seededHousehold()
    const before = await caregiverIdOf(household, EMILY.email)
    expect(await household.setCaregiverEmail(EMILY.email, NEW_EMAIL)).toEqual({
      kind: "changed",
      email: NEW_EMAIL,
      closedSockets: 0,
    })
    expect(await caregiverIdOf(household, NEW_EMAIL)).toBe(before)
    expect((await get(household, "/api/me", NEW_EMAIL)).status).toBe(200)
  })

  it("refuses the old email from then on", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const household = await seededHousehold()
    await household.setCaregiverEmail(EMILY.email, NEW_EMAIL)
    expect((await get(household, "/api/me", EMILY.email)).status).toBe(401)
  })

  it("closes that caregiver's sockets as signed out, and leaves the other parent's open", async () => {
    const household = await seededHousehold()
    const emily = await connect(household, EMILY.email)
    const andrew = await connect(household, ANDREW.email)
    const emilyClosed = closed(emily)
    expect(await household.setCaregiverEmail(EMILY.email, NEW_EMAIL)).toMatchObject({ closedSockets: 1 })
    expect(await emilyClosed).toEqual(CAREGIVER_DISABLED)
    expect(andrew.readyState).toBe(WebSocket.OPEN)
  })

  it("stamps the caregiver's updated_at", async () => {
    vi.useFakeTimers({ now: NOW + HOUR_MS, toFake: ["Date"] })
    const household = await seededHousehold()
    await household.setCaregiverEmail(EMILY.email, NEW_EMAIL)
    const stored = await inStorage(household, (sql) =>
      sql.exec("SELECT email, updated_at FROM caregivers WHERE email = ?", NEW_EMAIL).one(),
    )
    expect(stored).toEqual({ email: NEW_EMAIL, updated_at: NOW + HOUR_MS })
  })

  it.each([
    ["no caregiver has the old email", "stranger@example.test", NEW_EMAIL, "unknown"],
    ["the other caregiver has the new email", EMILY.email, ANDREW.email, "taken"],
    ["the new email is the one they have", EMILY.email, EMILY.email, "taken"],
  ])("changes nothing when %s", async (_label, email, newEmail, kind) => {
    const household = await seededHousehold()
    const emails = () =>
      inStorage(household, (sql) => sql.exec("SELECT email FROM caregivers ORDER BY email").toArray())
    const before = await emails()
    expect(await household.setCaregiverEmail(email, newEmail)).toEqual({ kind })
    expect(await emails()).toEqual(before)
  })
})

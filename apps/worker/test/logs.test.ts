import { afterEach, describe, expect, it, vi } from "vitest"
import { ACTION_ID, ANDREW, caregiverId, HOUR_MS, NOW, seededHousehold } from "./fixtures.ts"
import { get, type Household, inStorage, ORIGIN, send } from "./requests.ts"

const STRANGER = "stranger@example.test"

const andrewsId = (household: Household) => inStorage(household, (sql) => caregiverId(sql, ANDREW.email))

afterEach(() => {
  vi.restoreAllMocks()
})

describe("what the household logs", () => {
  it("logs a refused email's route and why, never the email", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const household = await seededHousehold()
    await get(household, "/api/me", STRANGER)
    await household.fetch(`${ORIGIN}/api/ws`, { headers: { upgrade: "websocket", "x-bt-email": STRANGER } })
    expect(consoleWarn.mock.calls).toEqual([
      [{ event: "refused", reason: "not-a-caregiver", route: "GET /api/me" }],
      [{ event: "refused", reason: "not-a-caregiver", route: "GET /api/ws" }],
    ])
    expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain(STRANGER)
  })

  it("logs a read's defect with its route and the caregiver's id", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const household = await seededHousehold()
    await inStorage(household, (sql) => sql.exec("DELETE FROM child"))
    expect((await get(household, "/api/me", ANDREW.email)).status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith({
      event: "defect",
      route: "GET /api/me",
      caregiverId: await andrewsId(household),
      actionId: null,
    })
  })

  it("logs a save's defect with its actionId, so the receipt it never wrote can be traced", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const household = await seededHousehold()
    await inStorage(household, (sql) => sql.exec("DROP TABLE diapers"))
    const diaper = { actionId: ACTION_ID, occurredAt: NOW - HOUR_MS, wet: true, dirty: false }
    expect((await send(household, "POST", "/api/diapers", JSON.stringify(diaper))).status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith({
      event: "defect",
      route: "POST /api/diapers",
      caregiverId: await andrewsId(household),
      actionId: ACTION_ID,
    })
  })

  it("logs nothing for an answer that isn't a defect", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const household = await seededHousehold()
    await get(household, "/api/me", ANDREW.email)
    await send(household, "POST", "/api/diapers", JSON.stringify({ actionId: ACTION_ID, wet: true }))
    expect(consoleError).not.toHaveBeenCalled()
  })
})

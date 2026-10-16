import { env, runInDurableObject } from "cloudflare:test"
import { describe, expect, it, vi } from "vitest"
import { RESTART_REASON } from "../src/admin.ts"
import type { HouseholdDO } from "../src/household.ts"
import { ANDREW, EMILY, SEED } from "./fixtures.ts"
import { get, type Household, inStorage, ORIGIN } from "./requests.ts"

const BOOKMARK_FORMAT = /^[0-9a-f]+(?:-[0-9a-f]+)+$/

const seededAs = async (name: string) => {
  const household = env.HOUSEHOLD.getByName(name)
  await household.seedHousehold(SEED)
  return household
}

const connect = async (household: Household, email: string) => {
  const response = await household.fetch(`${ORIGIN}/api/ws`, { headers: { upgrade: "websocket", "x-bt-email": email } })
  return { status: response.status, socket: response.webSocket }
}

const restarted = (household: Household) =>
  runInDurableObject(household, (instance: HouseholdDO) => instance.restart()).then(
    () => "kept running",
    (error: Error) => error.message,
  )

describe("the household's point-in-time recovery", () => {
  it("names the current point in its history with a bookmark", async () => {
    const household = await seededAs(crypto.randomUUID())
    expect(await runInDurableObject(household, (instance) => instance.pitrBookmark())).toMatch(BOOKMARK_FORMAT)
  })

  it("can only schedule a restore on Cloudflare, since the local runtime keeps no history (proven on deploy day)", async () => {
    const household = await seededAs(crypto.randomUUID())
    const outcome = await runInDurableObject(household, async (instance) =>
      instance.pitrScheduleRestore({ kind: "bookmark", bookmark: await instance.pitrBookmark() }),
    ).then(
      () => "scheduled",
      (error: Error) => error.message,
    )
    expect(outcome).toContain("does not implement point-in-time recovery")
  })
})

describe("restarting the household", () => {
  it("rejects its caller with the restart's reason, which tells the admin route the restart happened", async () => {
    const household = await seededAs(crypto.randomUUID())
    expect(await restarted(household)).toBe(RESTART_REASON)
  })

  it("comes back on the next request with its records", async () => {
    const name = crypto.randomUUID()
    expect(await restarted(await seededAs(name))).toBe(RESTART_REASON)
    const response = await get(env.HOUSEHOLD.getByName(name), "/api/me", ANDREW.email)
    expect(response.status).toBe(200)
  })

  it("drops every socket, so a caregiver the restore disabled is refused when their phone reconnects", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const name = crypto.randomUUID()
    const household = await seededAs(name)
    const { socket } = await connect(household, EMILY.email)
    if (socket === null) throw new Error("the household answered without a socket")
    socket.accept()
    const dropped = new Promise<number>((resolve) => {
      socket.addEventListener("close", ({ code }) => resolve(code), { once: true })
    })
    await inStorage(household, (sql) => sql.exec("UPDATE caregivers SET active = 0 WHERE email = ?", EMILY.email))
    await restarted(household)
    expect(await dropped).toBe(1006)
    expect((await connect(env.HOUSEHOLD.getByName(name), EMILY.email)).status).toBe(401)
    vi.restoreAllMocks()
  })
})

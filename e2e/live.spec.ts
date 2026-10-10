import { expect, test, type WebSocketRoute } from "@playwright/test"

const HEARTBEAT_MS = 30_000
const FIRST_RETRY_AT_MOST = 1_000

test("opens a socket to the household as the signed-in caregiver, and the household answers its heartbeat", async ({
  page,
}) => {
  await page.clock.install()
  const opened = page.waitForEvent("websocket", (socket) => new URL(socket.url()).pathname === "/api/ws")
  await page.goto("/")
  const socket = await opened
  const frames: string[] = []
  socket.on("framesent", ({ payload }) => frames.push(`sent ${String(payload)}`))
  socket.on("framereceived", ({ payload }) => frames.push(`received ${String(payload)}`))
  await expect
    .poll(async () => {
      await page.clock.runFor(HEARTBEAT_MS)
      return frames
    })
    .toEqual(expect.arrayContaining(["sent ping", "received pong"]))
})

test.describe("with the household's socket played by the test", () => {
  let sockets: WebSocketRoute[]

  test.beforeEach(async ({ page }) => {
    sockets = []
    await page.clock.install()
    await page.routeWebSocket(/\/api\/ws$/, (socket) => {
      sockets.push(socket)
    })
    await page.goto("/")
    await expect(page.getByText("Robin")).toBeVisible()
    await expect.poll(() => sockets.length).toBe(1)
  })

  const socket = (index: number) => {
    const found = sockets[index]
    if (found === undefined) throw new Error(`socket ${index} was never opened`)
    return found
  }

  test("refetches what a changed message names", async ({ page }) => {
    const refetch = page.waitForRequest("**/api/me")
    socket(0).send(JSON.stringify({ changed: [["me"]] }))
    await refetch
  })

  test("reconnects after the socket drops, and refetches everything once it's back", async ({ page }) => {
    const refetch = page.waitForRequest("**/api/me")
    await socket(0).close({ code: 1011, reason: "restarting" })
    await page.clock.runFor(FIRST_RETRY_AT_MOST)
    await expect.poll(() => sockets.length).toBe(2)
    await refetch
  })

  test("asks to sign in and stops reconnecting when the household closes it because the caregiver was disabled", async ({
    page,
  }) => {
    await socket(0).close({ code: 4401, reason: "caregiver disabled" })
    await expect(page.getByRole("alert").filter({ hasText: "Sign in to continue" })).toBeVisible()
    await page.clock.runFor(10 * HEARTBEAT_MS)
    expect(sockets).toHaveLength(1)
  })

  test("hides No connection when the household next answers the heartbeat, after a refetch failed while the socket stayed up", async ({
    page,
  }) => {
    socket(0).onMessage((message) => {
      if (message === "ping") socket(0).send("pong")
    })
    await page.route("**/api/me", (route) => route.abort())
    socket(0).send(JSON.stringify({ changed: [["me"]] }))
    const noConnection = page.getByRole("alert").filter({ hasText: "No connection" })
    await expect(noConnection).toBeVisible()
    await page.clock.runFor(HEARTBEAT_MS)
    await expect(noConnection).toBeHidden()
    expect(sockets).toHaveLength(1)
  })
})

import type { Page, WebSocketRoute } from "@playwright/test"
import { expect, test } from "./test.ts"

const HEARTBEAT_MS = 30_000
const FIRST_RETRY_AT_MOST = 1_000
const MINUTE = 60_000
const NINE_THIRTY_IN_VANCOUVER = Date.UTC(2026, 9, 9, 16, 30)

let sockets: WebSocketRoute[] = []

const socket = (index: number) => {
  const found = sockets[index]
  if (found === undefined) throw new Error(`socket ${index} was never opened`)
  return found
}

const openWithSocketPlayed = async (page: Page) => {
  sockets = []
  await page.routeWebSocket(/\/api\/ws$/, (played) => {
    sockets.push(played)
  })
  const todayAnswered = Promise.all(["**/api/today", "**/api/last24h"].map((url) => page.waitForResponse(url)))
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await Promise.all((await todayAnswered).map((response) => response.finished()))
  await expect(page.getByText("Loading…")).toBeHidden()
  await expect.poll(() => sockets.length).toBe(1)
}

test.describe("with the household's real socket", () => {
  test.use({ household: "real" })

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
})

test.describe("with the household's socket played by the test", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install()
    await openWithSocketPlayed(page)
  })

  test("refetches what a changed message names", async ({ page }) => {
    const refetch = page.waitForRequest("**/api/me")
    socket(0).send(JSON.stringify({ changed: [["me"]] }))
    await refetch
  })

  test("refetches only the queries a changed message names, leaving Today's others alone", async ({ page }) => {
    const asked: string[] = []
    page.on("request", (request) => {
      const { pathname } = new URL(request.url())
      if (pathname.startsWith("/api/")) asked.push(pathname)
    })
    const refetched = page.waitForResponse("**/api/last24h")
    socket(0).send(JSON.stringify({ changed: [["last24h"]] }))
    await refetched
    expect(asked).toEqual(["/api/last24h"])
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

  test("drops a socket the household stops answering within two beats, then opens another and refetches everything", async ({
    page,
  }) => {
    const refetch = page.waitForRequest("**/api/me")
    await page.clock.runFor(HEARTBEAT_MS)
    expect(sockets).toHaveLength(1)
    await page.clock.runFor(HEARTBEAT_MS)
    await page.clock.runFor(FIRST_RETRY_AT_MOST)
    await expect.poll(() => sockets.length).toBe(2)
    await refetch
  })

  test("keeps a socket whose ping has gone unanswered for only one beat", async ({ page }) => {
    await page.clock.runFor(HEARTBEAT_MS)
    await page.clock.runFor(FIRST_RETRY_AT_MOST)
    expect(sockets).toHaveLength(1)
  })

  test("reconnects at once when the browser comes back online, without waiting for the retry timer", async ({
    page,
  }) => {
    await page.clock.pauseAt(new Date(Date.now() + 2_000))
    await socket(0).close({ code: 1011, reason: "restarting" })
    await page.evaluate('window.dispatchEvent(new Event("online"))')
    await expect.poll(() => sockets.length).toBe(2)
  })
})

test.describe("Updated, with the household's socket played by the test", () => {
  test.use({ timezoneId: "Europe/London" })

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NINE_THIRTY_IN_VANCOUVER })
    await openWithSocketPlayed(page)
  })

  test("stays at the last answer when a change the household announces can't be fetched", async ({ page }) => {
    await page.route("**/api/today", (route) => route.abort())
    await page.clock.setSystemTime(NINE_THIRTY_IN_VANCOUVER + 12 * MINUTE)
    socket(0).send(JSON.stringify({ changed: [["today"]] }))
    await expect(page.getByRole("alert").filter({ hasText: "No connection" })).toContainText(/Updated 9:30\sAM\./)
  })

  test("stays at the last answer before the socket dropped when nothing can be fetched once it's back", async ({
    page,
  }) => {
    await page.route("**/api/**", (route) => route.abort())
    await socket(0).close({ code: 1011, reason: "restarting" })
    await page.clock.setSystemTime(NINE_THIRTY_IN_VANCOUVER + 20 * MINUTE)
    await page.clock.runFor(FIRST_RETRY_AT_MOST)
    await expect.poll(() => sockets.length).toBe(2)
    await expect(page.getByRole("alert").filter({ hasText: "No connection" })).toContainText(/Updated 9:30\sAM\./)
  })
})

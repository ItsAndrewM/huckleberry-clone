import { expect, test } from "@playwright/test"

test("opens a socket to the household as the signed-in caregiver, and the household answers its heartbeat", async ({
  page,
}) => {
  await page.goto("/")
  const opened = page.waitForEvent("websocket")
  await page.evaluate('window.liveSocket = new WebSocket(location.origin.replace("http", "ws") + "/api/ws")')
  const socket = await opened
  expect(new URL(socket.url()).pathname).toBe("/api/ws")
  await page.waitForFunction("window.liveSocket.readyState === WebSocket.OPEN")
  const pong = socket.waitForEvent("framereceived")
  await page.evaluate('window.liveSocket.send("ping")')
  expect((await pong).payload).toBe("pong")
})

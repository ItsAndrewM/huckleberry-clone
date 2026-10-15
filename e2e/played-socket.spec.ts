import { expect, test } from "./test.ts"

const OPEN = `new WebSocket(location.origin.replace(/^http/u, "ws") + "/api/ws")`

const within2Seconds = (promise: string, otherwise: string) =>
  `Promise.race([${promise}, new Promise((resolve) => setTimeout(() => resolve("${otherwise}"), 2000))])`

const answerToPing = within2Seconds(
  `new Promise((resolve) => {
    const socket = ${OPEN}
    socket.onopen = () => socket.send("ping")
    socket.onmessage = (event) => resolve(String(event.data))
  })`,
  "no answer",
)

const howANewSocketEnds = within2Seconds(
  `new Promise((resolve) => {
    const socket = ${OPEN}
    socket.onopen = () => resolve("opened")
    socket.onclose = (event) => resolve("closed " + event.code)
  })`,
  "neither",
)

const keepAnOpenSocket = `new Promise((resolve) => {
  const socket = ${OPEN}
  window.probeClosed = new Promise((closed) => {
    socket.onclose = (event) => closed("closed " + event.code)
  })
  socket.onopen = () => resolve()
})`

test("answers the household's heartbeat on a page's played socket", async ({ page }) => {
  await page.goto("/")
  expect(await page.evaluate<string>(answerToPing)).toBe("pong")
})

test("closes a page's played socket as the test goes offline, and refuses another until it's back online", async ({
  page,
  context,
}) => {
  await page.goto("/")
  await page.evaluate(keepAnOpenSocket)
  await context.setOffline(true)
  expect(await page.evaluate<string>(within2Seconds("window.probeClosed", "still open"))).toBe("closed 1011")
  expect(await page.evaluate<string>(howANewSocketEnds)).toBe("closed 1011")
  await context.setOffline(false)
  expect(await page.evaluate<string>(howANewSocketEnds)).toBe("opened")
})

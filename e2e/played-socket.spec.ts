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

const PLAYED = "/api/played-answer"

const howARequestEnds = `fetch("${PLAYED}").then(() => "answered", () => "refused")`

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

test("refuses an answer the test plays once it has gone offline, as a phone's network would, and answers again once it's back", async ({
  page,
  context,
}) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let asked = 0
  await page.route(`**${PLAYED}`, async (route) => {
    asked += 1
    if (asked === 1) await held
    await route.fulfill({ json: {} })
  })
  await page.goto("/")
  const first = page.evaluate<string>(howARequestEnds)
  await expect.poll(() => asked).toBe(1)
  await context.setOffline(true)
  release()
  expect(await first).toBe("refused")
  await context.setOffline(false)
  expect(await page.evaluate<string>(howARequestEnds)).toBe("answered")
})

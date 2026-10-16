import { type BrowserContext, test as base, expect, type WebSocketRoute } from "@playwright/test"

export { expect }

type Household = "played" | "real"
type QueryKey = ReadonlyArray<string | number>

export interface PlayedSocket {
  readonly changed: (...keys: ReadonlyArray<QueryKey>) => Promise<void>
}

const HOUSEHOLD_SOCKET = /\/api\/ws$/u
const OFFLINE = { code: 1011, reason: "offline" }
const openSocketsOf = new WeakMap<BrowserContext, Set<WebSocketRoute>>()

const answerTheHeartbeat = (socket: WebSocketRoute) =>
  socket.onMessage((message) => {
    if (message === "ping") socket.send("pong")
  })

const playTheHousehold = async (context: BrowserContext) => {
  const open = new Set<WebSocketRoute>()
  let offline = false
  openSocketsOf.set(context, open)
  await context.routeWebSocket(HOUSEHOLD_SOCKET, async (socket) => {
    if (offline) return socket.close(OFFLINE)
    open.add(socket)
    answerTheHeartbeat(socket)
    socket.onClose(() => open.delete(socket))
  })
  const setOffline = context.setOffline.bind(context)
  context.setOffline = async (goingOffline) => {
    offline = goingOffline
    if (goingOffline) await Promise.all([...open].map((socket) => socket.close(OFFLINE)))
    await setOffline(goingOffline)
  }
}

const keepDateNowWhole = () => {
  const now = Date.now
  if (Object.hasOwn(now, "whole")) return
  Date.now = Object.assign(() => Math.floor(now()), { whole: true })
}

const keepTheFakeClockWhole = (context: BrowserContext) => {
  let kept: Promise<void> | undefined
  const keep = () => {
    kept ??= context
      .addInitScript(keepDateNowWhole)
      .then(() => Promise.all(context.pages().map((page) => page.evaluate(keepDateNowWhole))))
      .then(() => undefined)
    return kept
  }
  const thenKeep =
    <Args extends ReadonlyArray<unknown>>(call: (...args: Args) => Promise<void>) =>
    async (...args: Args) => {
      await call(...args)
      await keep()
    }
  const { clock } = context
  clock.install = thenKeep(clock.install.bind(clock))
  clock.fastForward = thenKeep(clock.fastForward.bind(clock))
  clock.pauseAt = thenKeep(clock.pauseAt.bind(clock))
  clock.resume = thenKeep(clock.resume.bind(clock))
  clock.runFor = thenKeep(clock.runFor.bind(clock))
  clock.setFixedTime = thenKeep(clock.setFixedTime.bind(clock))
  clock.setSystemTime = thenKeep(clock.setSystemTime.bind(clock))
}

const sendChanged = async (context: BrowserContext, keys: ReadonlyArray<QueryKey>) => {
  const open = openSocketsOf.get(context)
  if (open === undefined)
    throw new Error('socket.changed plays the household, which test.use({ household: "real" }) turns off')
  await expect.poll(() => open.size).toBeGreaterThan(0)
  const newest = [...open].at(-1)
  newest?.send(JSON.stringify({ changed: keys }))
}

export const test = base.extend<{ household: Household; socket: PlayedSocket }>({
  household: ["played", { option: true }],
  context: async ({ context, household }, use) => {
    if (household === "played") await playTheHousehold(context)
    keepTheFakeClockWhole(context)
    await use(context)
  },
  socket: async ({ context }, use) => {
    await use({ changed: (...keys) => sendChanged(context, keys) })
  },
})

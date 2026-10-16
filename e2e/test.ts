import { type BrowserContext, test as base, expect, type Page, type Route, type WebSocketRoute } from "@playwright/test"

export { expect }

type Household = "played" | "real"
type QueryKey = ReadonlyArray<string | number>
type RouteArguments = Parameters<Page["route"]>

export interface PlayedSocket {
  readonly changed: (...keys: ReadonlyArray<QueryKey>) => Promise<void>
}

const HOUSEHOLD_SOCKET = /\/api\/ws$/u
const OFFLINE = { code: 1011, reason: "offline" }
const openSocketsOf = new WeakMap<BrowserContext, Set<WebSocketRoute>>()
const offline = new WeakSet<BrowserContext>()
const answeringOnlyOnline = new WeakSet<Page>()

const answerTheHeartbeat = (socket: WebSocketRoute) =>
  socket.onMessage((message) => {
    if (message === "ping") socket.send("pong")
  })

const playTheHousehold = async (context: BrowserContext) => {
  const open = new Set<WebSocketRoute>()
  openSocketsOf.set(context, open)
  await context.routeWebSocket(HOUSEHOLD_SOCKET, async (socket) => {
    if (offline.has(context)) return socket.close(OFFLINE)
    open.add(socket)
    answerTheHeartbeat(socket)
    socket.onClose(() => open.delete(socket))
  })
  return open
}

const refusedWhileOffline = (played: Route, context: BrowserContext): Route => {
  const refuse = () => played.abort("internetdisconnected")
  return {
    abort: (errorCode) => played.abort(errorCode),
    continue: (options) => (offline.has(context) ? refuse() : played.continue(options)),
    fallback: (options) => played.fallback(options),
    fetch: (options) => played.fetch(options),
    fulfill: (options) => (offline.has(context) ? refuse() : played.fulfill(options)),
    request: () => played.request(),
  }
}

const answerOnlyOnline = (page: Page, context: BrowserContext) => {
  if (answeringOnlyOnline.has(page)) return
  answeringOnlyOnline.add(page)
  const route = page.route.bind(page)
  page.route = (url: RouteArguments[0], handler: RouteArguments[1], options?: RouteArguments[2]) =>
    route(url, (played, request) => handler(refusedWhileOffline(played, context), request), options)
}

const followOffline = (context: BrowserContext, open: ReadonlySet<WebSocketRoute>) => {
  context.on("page", (page) => answerOnlyOnline(page, context))
  const setOffline = context.setOffline.bind(context)
  context.setOffline = async (goingOffline) => {
    if (goingOffline) {
      offline.add(context)
      await Promise.all([...open].map((socket) => socket.close(OFFLINE)))
    } else {
      offline.delete(context)
    }
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
    followOffline(context, household === "played" ? await playTheHousehold(context) : new Set())
    keepTheFakeClockWhole(context)
    await use(context)
  },
  page: async ({ page, context }, use) => {
    answerOnlyOnline(page, context)
    await use(page)
  },
  socket: async ({ context }, use) => {
    await use({ changed: (...keys) => sendChanged(context, keys) })
  },
})

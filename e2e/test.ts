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
    await use(context)
  },
  socket: async ({ context }, use) => {
    await use({ changed: (...keys) => sendChanged(context, keys) })
  },
})

import { CAREGIVER_DISABLED, HEARTBEAT } from "@bt/contracts"
import { Option } from "effect"
import { changedKeys, HEARTBEAT_MS, type LiveOptions, type LiveSocket, retryDelay } from "./live.ts"

export interface Live {
  readonly wake: () => void
  readonly stop: () => void
}

const closedForGood = (event: Event) => event instanceof CloseEvent && event.code === CAREGIVER_DISABLED.code

export const startLive = ({ open, onChanged, onStale, report, random = Math.random }: LiveOptions): Live => {
  let socket: LiveSocket | null = null
  let attempt = 0
  let lost = false
  let stopped = false
  let awaitingPong = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const drop = () => {
    clearInterval(heartbeat)
    socket = null
    lost = true
  }

  const reconnectLater = () => {
    if (stopped) return
    retry = setTimeout(connect, retryDelay(attempt, random))
    attempt += 1
  }

  const beat = (current: LiveSocket) => {
    if (!awaitingPong) {
      awaitingPong = true
      current.send(HEARTBEAT.ping)
      return
    }
    drop()
    current.close()
    reconnectLater()
  }

  const opens = (current: LiveSocket) => {
    attempt = 0
    awaitingPong = false
    report("heard")
    if (lost) onStale()
    heartbeat = setInterval(() => beat(current), HEARTBEAT_MS)
  }

  const hears = (data: string) => {
    report("heard")
    if (data === HEARTBEAT.pong) {
      awaitingPong = false
      return
    }
    Option.match(changedKeys(data), { onNone: onStale, onSome: onChanged })
  }

  const closes = (event: Event) => {
    drop()
    if (!closedForGood(event)) return reconnectLater()
    stopped = true
    report("signed-out")
  }

  function connect() {
    const current = open()
    socket = current
    current.addEventListener("open", () => socket === current && opens(current))
    current.addEventListener("message", (event) => {
      if (socket === current && event instanceof MessageEvent) hears(String(event.data))
    })
    current.addEventListener("close", (event) => socket === current && closes(event))
  }

  connect()
  return {
    wake: () => {
      if (stopped || socket !== null) return
      clearTimeout(retry)
      attempt = 0
      connect()
    },
    stop: () => {
      stopped = true
      clearTimeout(retry)
      const current = socket
      drop()
      current?.close()
    },
  }
}

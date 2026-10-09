import { CAREGIVER_DISABLED, HEARTBEAT, type QueryKey, queryKeys } from "@bt/contracts"
import { Option } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Signal } from "../src/api/connectivity.ts"
import { startLive } from "../src/api/live-connection.ts"
import { changedKeys, HEARTBEAT_MS, type LiveSocket, retryDelay, socketUrl } from "../src/api/live.ts"

class FakeSocket extends EventTarget implements LiveSocket {
  readonly sent: string[] = []
  closed = false

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
  }

  opens() {
    this.dispatchEvent(new Event("open"))
  }

  hears(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }

  closes(code = 1006) {
    this.dispatchEvent(new CloseEvent("close", { code }))
  }
}

const FIRST_RETRY_AT_MOST = 1_000

const live = () => {
  const sockets: FakeSocket[] = []
  const changed: Array<ReadonlyArray<QueryKey>> = []
  const signals: Signal[] = []
  let staleCount = 0
  const connection = startLive({
    open: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    onChanged: (keys) => changed.push(keys),
    onStale: () => {
      staleCount += 1
    },
    report: (signal) => signals.push(signal),
    random: () => 1,
  })
  const latest = () => {
    const socket = sockets.at(-1)
    if (socket === undefined) throw new Error("no socket was opened")
    return socket
  }
  return { connection, sockets, changed, signals, latest, stale: () => staleCount }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("socketUrl", () => {
  it("opens the socket on the page's own origin, wss: when the page is https:", () => {
    expect(socketUrl({ protocol: "https:", host: "bt.example.test" })).toBe("wss://bt.example.test/api/ws")
    expect(socketUrl({ protocol: "http:", host: "localhost:4173" })).toBe("ws://localhost:4173/api/ws")
  })
})

describe("retryDelay", () => {
  it("waits 1 s after the first failure, doubling to at most 30 s, with up to half taken off at random", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 12].map((attempt) => retryDelay(attempt, () => 1))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ])
    expect(retryDelay(0, () => 0)).toBe(500)
    expect(retryDelay(12, () => 0)).toBe(15_000)
  })
})

describe("changedKeys", () => {
  it("decodes each key on its own and skips a kind this app doesn't know, so a newer Worker can't lose the list", () => {
    const message = JSON.stringify({ changed: [["today"], ["sleep", "2026-10-09"], ["day", "2026-10-09"]] })
    expect(changedKeys(message)).toEqual(Option.some([queryKeys.today, queryKeys.day("2026-10-09")]))
  })

  it.each(["pong!", "{}", '{"changed":"today"}', "[1,2]"])("can't read %s as a changed list", (data) => {
    expect(changedKeys(data)).toEqual(Option.none())
  })
})

describe("startLive", () => {
  it("opens one socket at once, and treats its opening as the network being up, not as proof of a session", () => {
    const { sockets, latest, signals, stale } = live()
    latest().opens()
    expect(sockets).toHaveLength(1)
    expect(signals).toEqual(["online"])
    expect(stale()).toBe(0)
  })

  it("passes on the keys a changed message names", () => {
    const { latest, changed, stale } = live()
    latest().opens()
    latest().hears(JSON.stringify({ changed: [["today"], ["last24h"]] }))
    expect(changed).toEqual([[queryKeys.today, queryKeys.last24h]])
    expect(stale()).toBe(0)
  })

  it("refreshes everything when a message isn't a changed list it can read", () => {
    const { latest, changed, stale } = live()
    latest().opens()
    latest().hears("surprise")
    expect(changed).toEqual([])
    expect(stale()).toBe(1)
  })

  it("pings every 30 s, and a pong keeps the socket", () => {
    const { latest, sockets, changed, stale } = live()
    latest().opens()
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(latest().sent).toEqual([HEARTBEAT.ping])
    latest().hears(HEARTBEAT.pong)
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(latest().sent).toEqual([HEARTBEAT.ping, HEARTBEAT.ping])
    expect(sockets).toHaveLength(1)
    expect([changed, stale()]).toEqual([[], 0])
  })

  it("gives up on a socket whose ping went unanswered for a whole beat, and opens another", () => {
    const { latest, sockets } = live()
    const first = latest()
    first.opens()
    vi.advanceTimersByTime(2 * HEARTBEAT_MS)
    expect(first.closed).toBe(true)
    vi.advanceTimersByTime(FIRST_RETRY_AT_MOST)
    expect(sockets).toHaveLength(2)
    first.closes()
    vi.advanceTimersByTime(30_000)
    expect(sockets).toHaveLength(2)
  })

  it("reconnects after a close, waiting longer after each failure, and refreshes everything once it's back", () => {
    const { latest, sockets, stale } = live()
    latest().opens()
    latest().closes()
    vi.advanceTimersByTime(FIRST_RETRY_AT_MOST - 1)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)
    latest().closes()
    vi.advanceTimersByTime(2_000)
    expect(sockets).toHaveLength(3)
    latest().opens()
    expect(stale()).toBe(1)
    latest().closes()
    vi.advanceTimersByTime(FIRST_RETRY_AT_MOST)
    expect(sockets).toHaveLength(4)
  })

  it("stops for good when the household closes the socket because this caregiver was disabled", () => {
    const { latest, sockets, signals } = live()
    latest().opens()
    latest().closes(CAREGIVER_DISABLED.code)
    vi.advanceTimersByTime(10 * 30_000)
    expect(sockets).toHaveLength(1)
    expect(signals).toEqual(["online", "signed-out"])
  })

  it("reconnects at once when woken while waiting to retry, and ignores a wake while connected", () => {
    const { connection, latest, sockets } = live()
    latest().opens()
    connection.wake()
    expect(sockets).toHaveLength(1)
    latest().closes()
    connection.wake()
    expect(sockets).toHaveLength(2)
    vi.advanceTimersByTime(30_000)
    expect(sockets).toHaveLength(2)
  })

  it("closes its socket when stopped and never reconnects", () => {
    const { connection, latest, sockets } = live()
    latest().opens()
    connection.stop()
    expect(latest().closed).toBe(true)
    latest().closes()
    connection.wake()
    vi.advanceTimersByTime(10 * 30_000)
    expect(sockets).toHaveLength(1)
  })

  it("replaces a dead socket with one that stays up, and refreshes everything once it's back", () => {
    const { latest, sockets, stale } = live()
    const first = latest()
    first.opens()
    vi.advanceTimersByTime(2 * HEARTBEAT_MS)
    vi.advanceTimersByTime(FIRST_RETRY_AT_MOST)
    const second = latest()
    second.opens()
    expect(stale()).toBe(1)
    for (let beat = 0; beat < 4; beat += 1) {
      vi.advanceTimersByTime(HEARTBEAT_MS)
      second.hears(HEARTBEAT.pong)
    }
    expect(second.closed).toBe(false)
    expect(sockets).toHaveLength(2)
  })

  it("never reconnects after the household disables this caregiver, even when woken", () => {
    const { connection, latest, sockets } = live()
    latest().opens()
    latest().closes(CAREGIVER_DISABLED.code)
    connection.wake()
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(1)
  })

  it("opens nothing when stopped while waiting to retry", () => {
    const { connection, latest, sockets } = live()
    latest().opens()
    latest().closes()
    connection.stop()
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(1)
  })

  it("refreshes everything when the first socket to open follows a failed attempt", () => {
    const { latest, sockets, stale, signals } = live()
    latest().closes()
    vi.advanceTimersByTime(FIRST_RETRY_AT_MOST)
    expect(sockets).toHaveLength(2)
    latest().opens()
    expect(signals).toEqual(["online"])
    expect(stale()).toBe(1)
  })
})

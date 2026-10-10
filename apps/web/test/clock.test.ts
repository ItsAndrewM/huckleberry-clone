import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createClock } from "../src/timer/clock.ts"

const SECOND = 1000
const AT = Date.UTC(2026, 9, 9, 16, 30)

describe("createClock", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT + 700)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("tells the time to the second, so a screen drawn twice in one second shows the same", () => {
    const clock = createClock(SECOND)
    expect(clock.now()).toBe(AT)
    vi.advanceTimersByTime(299)
    expect(clock.now()).toBe(AT)
    vi.advanceTimersByTime(1)
    expect(clock.now()).toBe(AT + SECOND)
  })

  it("ticks as each second begins, not a second after it subscribed", () => {
    const clock = createClock(SECOND)
    const ticks: number[] = []
    clock.subscribe(() => ticks.push(clock.now()))
    vi.advanceTimersByTime(299)
    expect(ticks).toEqual([])
    vi.advanceTimersByTime(1)
    expect(ticks).toEqual([AT + SECOND])
    vi.advanceTimersByTime(2 * SECOND)
    expect(ticks).toEqual([AT + SECOND, AT + 2 * SECOND, AT + 3 * SECOND])
  })

  it("keeps ticking for the screens still showing it", () => {
    const clock = createClock(SECOND)
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    const leave = clock.subscribe(first)
    clock.subscribe(second)
    leave()
    vi.advanceTimersByTime(SECOND)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("stops its timer once no screen shows it", () => {
    const clock = createClock(SECOND)
    const leave = clock.subscribe(vi.fn<() => void>())
    vi.advanceTimersByTime(SECOND)
    leave()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("ticks again for a screen that comes back after every screen had left", () => {
    const clock = createClock(SECOND)
    const first = vi.fn<() => void>()
    const leave = clock.subscribe(first)
    vi.advanceTimersByTime(SECOND)
    expect(first).toHaveBeenCalledTimes(1)
    leave()
    expect(vi.getTimerCount()).toBe(0)
    const ticks: number[] = []
    clock.subscribe(() => ticks.push(clock.now()))
    vi.advanceTimersByTime(299)
    expect(ticks).toEqual([])
    vi.advanceTimersByTime(2 * SECOND + 1)
    expect(ticks).toEqual([AT + 2 * SECOND, AT + 3 * SECOND, AT + 4 * SECOND])
    expect(first).toHaveBeenCalledTimes(1)
  })
})

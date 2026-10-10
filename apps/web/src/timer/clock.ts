export interface Clock {
  readonly now: () => number
  readonly subscribe: (listener: () => void) => () => void
}

export const createClock = (tickMs: number): Clock => {
  const listeners = new Set<() => void>()
  let next: ReturnType<typeof setTimeout> | undefined
  const now = () => Math.floor(Date.now() / tickMs) * tickMs
  const tick = () => {
    next = setTimeout(tick, tickMs - (Date.now() % tickMs))
    for (const listener of listeners) listener()
  }
  return {
    now,
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1) next = setTimeout(tick, tickMs - (Date.now() % tickMs))
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) clearTimeout(next)
      }
    },
  }
}

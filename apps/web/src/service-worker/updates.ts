export type Checked = "checked" | "unavailable"

interface Registration {
  readonly update: () => Promise<Pick<ServiceWorkerRegistration, "scope">>
}

export interface UpdateSource {
  readonly getRegistration: () => Promise<Registration | undefined>
  readonly addEventListener: (type: "controllerchange", listener: () => void) => void
}

export interface Updates {
  readonly changes: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly check: () => Promise<Checked>
}

type Wait = (ms: number) => Promise<void>

export const CHECK_LIMIT_MS = 3_000

const pause: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const registrationOf = (source: UpdateSource | undefined) =>
  source === undefined ? Promise.resolve(undefined) : source.getRegistration().catch(() => undefined)

const updated = (registration: Registration, wait: Wait): Promise<Checked> =>
  Promise.race([
    registration.update().then(
      () => "checked" as const,
      () => "unavailable" as const,
    ),
    wait(CHECK_LIMIT_MS).then(() => "unavailable" as const),
  ])

export const watchUpdates = (source: UpdateSource | undefined, wait: Wait = pause): Updates => {
  let changes = 0
  const listeners = new Set<() => void>()
  source?.addEventListener("controllerchange", () => {
    changes += 1
    for (const listener of listeners) listener()
  })
  return {
    changes: () => changes,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    check: async () => {
      const registration = await registrationOf(source)
      return registration === undefined ? "unavailable" : updated(registration, wait)
    },
  }
}

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

const registrationOf = (source: UpdateSource | undefined) =>
  source === undefined ? Promise.resolve(undefined) : source.getRegistration().catch(() => undefined)

export const watchUpdates = (source: UpdateSource | undefined): Updates => {
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
      if (registration === undefined) return "unavailable"
      return registration.update().then(
        () => "checked" as const,
        () => "unavailable" as const,
      )
    },
  }
}

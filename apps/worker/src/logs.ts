import type { Refusal } from "./access.ts"

export type Refused = Refusal | "not-admin" | "service-token" | "not-a-caregiver" | "not-json" | "foreign-origin"

export interface DefectContext {
  readonly route: string
  readonly caregiverId: string | null
  readonly actionId: string | null
}

export const routeOf = (method: string, url: string): string => `${method} ${new URL(url).pathname}`

export const logRefusal = (route: string, reason: Refused): void => {
  console.warn({ event: "refused", reason, route })
}

export const logOutage = (event: "keys-unavailable" | "household-unavailable", route: string, cause: string): void => {
  console.error({ event, route, cause })
}

export const logDefect = (context: DefectContext): void => {
  console.error({ event: "defect", ...context })
}

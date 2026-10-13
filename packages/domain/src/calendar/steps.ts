import type { Instant, Interval } from "../time/instant.ts"

export interface GridScale {
  readonly stepMs: number
  readonly minBlockSteps: number
  readonly pointSteps: number
}

export interface Placing {
  readonly bounds: Interval
  readonly now: Instant
  readonly scale: GridScale
  readonly steps: number
}

export const stepsIn = (bounds: Interval, stepMs: number): number => Math.ceil((bounds.end - bounds.start) / stepMs)

export const stepAt = (bounds: Interval, stepMs: number, at: Instant): number =>
  Math.round((Math.min(Math.max(at, bounds.start), bounds.end) - bounds.start) / stepMs)

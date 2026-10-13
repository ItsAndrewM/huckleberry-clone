import { contains } from "../interval/interval.ts"
import type { Instant } from "../time/instant.ts"
import { type Placing, stepAt } from "./steps.ts"

export interface CalendarPoint {
  readonly id: string
  readonly at: Instant
}

export interface PlacedCluster {
  readonly top: number
  readonly ids: ReadonlyArray<string>
}

const byTimeThenId = (a: CalendarPoint, b: CalendarPoint) => a.at - b.at || (a.id < b.id ? -1 : 1)

export const clusterPoints = (
  points: ReadonlyArray<CalendarPoint>,
  { bounds, scale, steps }: Placing,
): ReadonlyArray<PlacedCluster> => {
  const lowest = Math.max(0, steps - scale.pointSteps)
  const clusters: { readonly top: number; readonly ids: string[] }[] = []
  for (const point of points.filter(({ at }) => contains(bounds, at)).toSorted(byTimeThenId)) {
    const top = Math.min(stepAt(bounds, scale.stepMs, point.at), lowest)
    const last = clusters.at(-1)
    if (last !== undefined && top < last.top + scale.pointSteps) last.ids.push(point.id)
    else clusters.push({ top, ids: [point.id] })
  }
  return clusters
}

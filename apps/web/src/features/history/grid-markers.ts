import type { PlacedCluster } from "@bt/domain"
import type { Display } from "../today/display.ts"
import { type DayModel, type Entry, entriesIn } from "./day-model.ts"
import { clusterName, entryName, markerText } from "./entry-labels.ts"

export type MarkerKind = "bottle" | "diaper" | "several"

export interface Marker {
  readonly key: string
  readonly top: number
  readonly ids: ReadonlyArray<string>
  readonly kind: MarkerKind
  readonly text: string
  readonly name: string
}

const timeOf = (entry: Entry) => (entry.kind === "diaper" ? entry.diaper.occurredAt : entry.feed.startedAt)

const markerOf = (cluster: PlacedCluster, model: DayModel, display: Display, now: number): Marker => {
  const entries = entriesIn(model, cluster.ids)
  const [first] = entries
  const placed = { key: cluster.ids.join(), top: cluster.top, ids: cluster.ids }
  if (entries.length === 1 && first !== undefined) {
    const kind = first.kind === "diaper" ? "diaper" : "bottle"
    return { ...placed, kind, text: markerText(first, display.volume, now), name: entryName(first, display, now) }
  }
  const from = first === undefined ? 0 : timeOf(first)
  return {
    ...placed,
    kind: "several",
    text: `${entries.length} entries`,
    name: clusterName(entries.length, from, display),
  }
}

export const markersOf = (model: DayModel, display: Display, now: number): ReadonlyArray<Marker> =>
  model.grid.clusters.map((cluster) => markerOf(cluster, model, display, now))

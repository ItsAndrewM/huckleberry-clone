import type { PlacedBlock, Side } from "@bt/domain"
import { timeOf } from "../../api/today-change.ts"
import type { Display } from "../today/display.ts"
import { type DayModel, entriesIn } from "./day-model.ts"
import { type Marker, markersOf } from "./grid-markers.ts"

interface Placed {
  readonly key: string
  readonly at: number
}

export type GridItem = Placed &
  (
    | { readonly kind: "sleep"; readonly block: PlacedBlock<Side> }
    | { readonly kind: "feed"; readonly block: PlacedBlock<Side> }
    | { readonly kind: "marker"; readonly marker: Marker }
  )

const firstTime = (model: DayModel, ids: ReadonlyArray<string>) => Math.min(...entriesIn(model, ids).map(timeOf))

const byTime = (one: Placed, other: Placed) => one.at - other.at || (one.key < other.key ? -1 : 1)

export const gridItems = (model: DayModel, display: Display, now: number): ReadonlyArray<GridItem> =>
  [
    ...model.sleeps.map((block): GridItem => ({
      kind: "sleep",
      key: block.id,
      at: firstTime(model, [block.id]),
      block,
    })),
    ...model.grid.blocks.map((block): GridItem => ({
      kind: "feed",
      key: block.id,
      at: firstTime(model, [block.id]),
      block,
    })),
    ...markersOf(model, display, now).map((marker): GridItem => ({
      kind: "marker",
      key: marker.key,
      at: firstTime(model, marker.ids),
      marker,
    })),
  ].toSorted(byTime)

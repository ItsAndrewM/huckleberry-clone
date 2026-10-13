import { contains } from "../interval/interval.ts"
import type { Instant, Interval } from "../time/instant.ts"
import type { Span } from "../timer/timer.ts"
import { type Extent, placeInLanes } from "./lanes.ts"
import { type Placing, stepAt } from "./steps.ts"

export interface CalendarBand<Kind extends string> extends Span {
  readonly kind: Kind
}

export interface CalendarBlock<Kind extends string> extends Span {
  readonly id: string
  readonly bands: ReadonlyArray<CalendarBand<Kind>>
}

export interface PlacedBand<Kind extends string> extends Extent {
  readonly kind: Kind
}

export interface PlacedBlock<Kind extends string> extends Extent {
  readonly id: string
  readonly lane: number
  readonly lanes: number
  readonly running: boolean
  readonly startsBefore: boolean
  readonly endsAfter: boolean
  readonly bands: ReadonlyArray<PlacedBand<Kind>>
}

const endOf = (span: Span, now: Instant) => span.endedAt ?? Math.max(now, span.startedAt)

const fragmentOf = (span: Span, { bounds, now }: Placing): Interval | null => {
  const start = Math.max(span.startedAt, bounds.start)
  const end = Math.min(endOf(span, now), bounds.end)
  const visible = span.startedAt === endOf(span, now) ? contains(bounds, span.startedAt) : start < end
  return visible ? { start, end } : null
}

const extentOf = (fragment: Interval, { bounds, scale, steps }: Placing): Extent => {
  const top = stepAt(bounds, scale.stepMs, fragment.start)
  const height = Math.min(Math.max(stepAt(bounds, scale.stepMs, fragment.end) - top, scale.minBlockSteps), steps)
  return { top: Math.min(top, steps - height), height }
}

const shareOf = (fragment: Interval, at: Instant, ifInstant: number) =>
  fragment.end === fragment.start ? ifInstant : (at - fragment.start) / (fragment.end - fragment.start)

const bandsOf = <Kind extends string>(
  block: CalendarBlock<Kind>,
  fragment: Interval,
  height: number,
  now: Instant,
): ReadonlyArray<PlacedBand<Kind>> =>
  block.bands.flatMap((band) => {
    const top = Math.round(shareOf(fragment, Math.max(band.startedAt, fragment.start), 0) * height)
    const bottom = Math.round(shareOf(fragment, Math.min(endOf(band, now), fragment.end), 1) * height)
    return bottom > top ? [{ kind: band.kind, top, height: bottom - top }] : []
  })

const byTopEndId = (a: Extent & { readonly id: string }, b: Extent & { readonly id: string }) =>
  a.top - b.top || a.top + a.height - (b.top + b.height) || (a.id < b.id ? -1 : 1)

export const placeBlocks = <Kind extends string>(
  blocks: ReadonlyArray<CalendarBlock<Kind>>,
  placing: Placing,
): ReadonlyArray<PlacedBlock<Kind>> => {
  const drawn = blocks.flatMap((block) => {
    const fragment = fragmentOf(block, placing)
    if (fragment === null) return []
    const extent = extentOf(fragment, placing)
    return [
      {
        id: block.id,
        ...extent,
        running: block.endedAt === null,
        startsBefore: block.startedAt < placing.bounds.start,
        endsAfter: endOf(block, placing.now) > placing.bounds.end,
        bands: bandsOf(block, fragment, extent.height, placing.now),
      },
    ]
  })
  return placeInLanes(drawn.toSorted(byTopEndId))
}

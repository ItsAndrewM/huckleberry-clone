import type { SegmentEntry } from "@bt/contracts"

const MINUTE_MS = 60_000

export interface Placed {
  readonly segment: SegmentEntry
  readonly kept: boolean
}

interface Listed extends Placed {
  readonly index: number
}

const meets = (previousEnd: number, start: number) => previousEnd > start && previousEnd < start + MINUTE_MS

const meeting = (previous: SegmentEntry | undefined, side: Listed): Listed => {
  const { segment, kept } = side
  if (kept || previous === undefined || !meets(previous.endedAt, segment.startedAt)) return side
  const startedAt = previous.endedAt
  return { ...side, segment: { ...segment, startedAt, endedAt: startedAt + segment.endedAt - segment.startedAt } }
}

export const snapped = (placed: ReadonlyArray<Placed>): ReadonlyArray<SegmentEntry> =>
  placed
    .map((side, index) => ({ ...side, index }))
    .toSorted((a, b) => a.segment.startedAt - b.segment.startedAt)
    .reduce<ReadonlyArray<Listed>>((done, side) => [...done, meeting(done.at(-1)?.segment, side)], [])
    .toSorted((a, b) => a.index - b.index)
    .map(({ segment }) => segment)

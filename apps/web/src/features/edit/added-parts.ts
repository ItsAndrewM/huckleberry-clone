import { whenAt } from "../../sheets/when.ts"
import { OTHER_SIDE } from "../../sides.ts"
import type { BottleFields, FeedDraft, SideFields } from "./feed-draft.ts"
import { checkedParts } from "./feed-entry.ts"

const MINUTE_MS = 60_000
const NEW_SIDE_MS = 5 * MINUTE_MS

const lastEnd = (draft: FeedDraft, zone: string, now: number) => {
  const checked = checkedParts(draft, zone, Number.POSITIVE_INFINITY)
  if (!checked.ok) return now
  const { segments, portions } = checked.value
  const ends = [...segments.map(({ endedAt }) => endedAt), ...portions.map(({ occurredAt }) => occurredAt)]
  return ends.length === 0 ? now : Math.max(...ends)
}

export const newSide = (draft: FeedDraft, zone: string, now: number): SideFields => {
  const previous = draft.sides.at(-1)?.fields.side
  const start = Math.min(lastEnd(draft, zone, now), now - NEW_SIDE_MS)
  return {
    side: previous === undefined ? "left" : OTHER_SIDE[previous],
    start: whenAt(start, zone),
    minutes: NEW_SIDE_MS / MINUTE_MS,
  }
}

export const newBottle = (draft: FeedDraft, zone: string, now: number): BottleFields => ({
  at: whenAt(Math.min(lastEnd(draft, zone, now), now), zone),
  breastMilkMl: 0,
  formulaMl: 0,
})

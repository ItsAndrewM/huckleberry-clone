import { whenAt } from "../../sheets/when.ts"
import { OTHER_SIDE } from "../../sides.ts"
import type { BottleFields, FeedDraft, SideFields } from "./feed-draft.ts"
import { lastEnd } from "./feed-entry.ts"

const MINUTE_MS = 60_000
const NEW_SIDE_MINUTES = 5

export const newSide = (draft: FeedDraft, zone: string, now: number): SideFields => {
  const previous = draft.sides.at(-1)?.fields.side
  const start = lastEnd(draft, zone, now) ?? now
  return {
    side: previous === undefined ? "left" : OTHER_SIDE[previous],
    start: whenAt(start, zone),
    minutes: Math.max(1, Math.min(NEW_SIDE_MINUTES, Math.floor((now - start) / MINUTE_MS))),
  }
}

export const newBottle = (draft: FeedDraft, zone: string, now: number): BottleFields => ({
  at: whenAt(Math.min(lastEnd(draft, zone, now) ?? now, now), zone),
  breastMilkMl: 0,
  formulaMl: 0,
})

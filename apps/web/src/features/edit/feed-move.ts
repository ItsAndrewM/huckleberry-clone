import { resolveWhen, type When, whenAt } from "../../sheets/when.ts"
import { formatMinutes } from "../today/format.ts"
import type { BottlePart, FeedDraft, SidePart } from "./feed-draft.ts"

const ANY_TIME = Number.POSITIVE_INFINITY
const MINUTE_MS = 60_000

const instantOf = (when: When, zone: string) => {
  const resolved = resolveWhen(when, zone, ANY_TIME)
  return resolved.ok && Number.isFinite(resolved.instant) ? resolved.instant : null
}

const shifted = (when: When, zone: string, offset: number): When => {
  const instant = instantOf(when, zone)
  return instant === null ? when : whenAt(instant + offset, zone)
}

const keptOrPicked = (when: When, base: number | undefined, zone: string) =>
  base !== undefined && instantOf(when, zone) === Math.floor(base / MINUTE_MS) * MINUTE_MS
    ? base
    : instantOf(when, zone)

const sideStart = ({ base, fields }: SidePart, zone: string) => keptOrPicked(fields.start, base?.startedAt, zone)

const bottleTime = ({ base, fields }: BottlePart, zone: string) => keptOrPicked(fields.at, base?.occurredAt, zone)

export const startOf = (draft: FeedDraft, zone: string): number | null => {
  const times = [
    ...draft.sides.map((part) => sideStart(part, zone)),
    ...draft.bottles.map((part) => bottleTime(part, zone)),
  ]
  const known = times.filter((time) => time !== null)
  return known.length === 0 ? null : Math.min(...known)
}

const movedSide = ({ key, base, fields }: SidePart, zone: string, offset: number): SidePart => ({
  key,
  base: base === null ? null : { ...base, startedAt: base.startedAt + offset, endedAt: base.endedAt + offset },
  fields: { ...fields, start: shifted(fields.start, zone, offset) },
})

const movedBottle = ({ key, base, fields }: BottlePart, zone: string, offset: number): BottlePart => ({
  key,
  base: base === null ? null : { ...base, occurredAt: base.occurredAt + offset },
  fields: { ...fields, at: shifted(fields.at, zone, offset) },
})

export const movedDraft = (draft: FeedDraft, zone: string, offset: number): FeedDraft => ({
  sides: draft.sides.map((part) => movedSide(part, zone, offset)),
  bottles: draft.bottles.map((part) => movedBottle(part, zone, offset)),
})

export const movedBy = (draft: FeedDraft, zone: string, when: When): number | null => {
  const start = startOf(draft, zone)
  const to = instantOf(when, zone)
  return start === null || to === null ? null : to - Math.floor(start / MINUTE_MS) * MINUTE_MS
}

export const moveText = (offset: number) => {
  if (offset === 0) return null
  const by = formatMinutes(Math.abs(offset) / 1000)
  return `Moves every side and bottle ${by} ${offset > 0 ? "later" : "earlier"}.`
}

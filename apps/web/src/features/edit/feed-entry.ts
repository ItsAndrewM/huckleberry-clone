import { MAX_SEGMENT_MS, type PortionEntry, type SegmentEntry } from "@bt/contracts"
import { FUTURE_TOLERANCE_MS } from "@bt/domain"
import { resolveWhen, sameWhen, type When, whenAt } from "../../sheets/when.ts"
import { type BottlePart, type FeedDraft, minutesOf, type Parts, type SidePart } from "./feed-draft.ts"
import { type Placed, snapped } from "./side-snap.ts"

const MINUTE_MS = 60_000
const MAX_MINUTES = MAX_SEGMENT_MS / MINUTE_MS

export type DraftIssue = "nothing" | "time" | "minutes" | "milk" | "overlap" | "future"

export type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: DraftIssue }

const timeAt = (when: When, zone: string, now: number): Checked<number> => {
  const resolved = resolveWhen(when, zone, now)
  if (resolved.ok) return { ok: true, value: resolved.instant }
  return { ok: false, issue: resolved.issue === "in_future" ? "future" : "time" }
}

const isMinutes = (minutes: number | null): minutes is number =>
  minutes !== null && Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES

const keptOrPicked = (when: When, base: number | null, zone: string, now: number): Checked<number> =>
  base !== null && sameWhen(when, whenAt(base, zone)) ? { ok: true, value: base } : timeAt(when, zone, now)

const endOf = ({ base, fields }: SidePart, start: number): number | null => {
  if (base !== null && fields.minutes === minutesOf(base)) return start + (base.endedAt - base.startedAt)
  return isMinutes(fields.minutes) ? start + fields.minutes * MINUTE_MS : null
}

const sideOf = (part: SidePart, zone: string, now: number): Checked<Placed> => {
  const start = keptOrPicked(part.fields.start, part.base?.startedAt ?? null, zone, now)
  if (!start.ok) return start
  const end = endOf(part, start.value)
  if (end === null) return { ok: false, issue: "minutes" }
  const segment = { side: part.fields.side, startedAt: start.value, endedAt: end }
  return { ok: true, value: { segment, kept: start.value === part.base?.startedAt } }
}

const bottleOf = ({ base, fields }: BottlePart, zone: string, now: number): Checked<PortionEntry> => {
  const { breastMilkMl, formulaMl } = fields
  if (breastMilkMl === null || formulaMl === null || breastMilkMl + formulaMl <= 0) return { ok: false, issue: "milk" }
  const at = keptOrPicked(fields.at, base?.occurredAt ?? null, zone, now)
  return at.ok ? { ok: true, value: { occurredAt: at.value, breastMilkMl, formulaMl } } : at
}

const overlapping = (segments: ReadonlyArray<SegmentEntry>) =>
  segments
    .toSorted((a, b) => a.startedAt - b.startedAt)
    .some((segment, index, sorted) => index > 0 && segment.startedAt < (sorted[index - 1]?.endedAt ?? 0))

const valuesOf = <T>(checked: ReadonlyArray<Checked<T>>) => checked.flatMap((one) => (one.ok ? [one.value] : []))

const partsIssue = ({ segments, portions }: Parts, now: number): DraftIssue | null => {
  if (segments.length + portions.length === 0) return "nothing"
  if (overlapping(segments)) return "overlap"
  const times = [...segments.map(({ endedAt }) => endedAt), ...portions.map(({ occurredAt }) => occurredAt)]
  return times.some((time) => time > now + FUTURE_TOLERANCE_MS) ? "future" : null
}

export const checkedParts = (draft: FeedDraft, zone: string, now: number): Checked<Parts> => {
  const sides = draft.sides.map((part) => sideOf(part, zone, now))
  const bottles = draft.bottles.map((part) => bottleOf(part, zone, now))
  const failed = [...sides, ...bottles].find((one) => !one.ok)
  if (failed !== undefined && !failed.ok) return failed
  const parts = { segments: snapped(valuesOf(sides)), portions: valuesOf(bottles) }
  const issue = partsIssue(parts, now)
  return issue === null ? { ok: true, value: parts } : { ok: false, issue }
}

export const lastEnd = (draft: FeedDraft, zone: string, now: number): number | null => {
  const segments = snapped(valuesOf(draft.sides.map((part) => sideOf(part, zone, now))))
  const times = draft.bottles.map(({ base, fields }) => keptOrPicked(fields.at, base?.occurredAt ?? null, zone, now))
  const ends = [...segments.map(({ endedAt }) => endedAt), ...valuesOf(times)]
  return ends.length === 0 ? null : Math.max(...ends)
}

export const ISSUES = {
  nothing: "",
  time: "Pick a time for each side and bottle.",
  minutes: "Give each side 1 to 240 minutes.",
  milk: "Give each bottle some breast milk or formula.",
  overlap: "Two sides overlap. Move one so they don't.",
  future: "That would end in the future.",
} as const satisfies Record<DraftIssue, string>

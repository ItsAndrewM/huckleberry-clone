import type { Feed, PortionEntry, SegmentEntry, Side } from "@bt/contracts"
import { type When, whenAt } from "../../sheets/when.ts"

const MINUTE_MS = 60_000

export interface SideFields {
  readonly side: Side
  readonly start: When
  readonly minutes: number | null
}

export interface BottleFields {
  readonly at: When
  readonly breastMilkMl: number | null
  readonly formulaMl: number | null
}

export interface SidePart {
  readonly key: string
  readonly base: SegmentEntry | null
  readonly fields: SideFields
}

export interface BottlePart {
  readonly key: string
  readonly base: PortionEntry | null
  readonly fields: BottleFields
}

export interface FeedDraft {
  readonly sides: ReadonlyArray<SidePart>
  readonly bottles: ReadonlyArray<BottlePart>
}

export interface Parts {
  readonly segments: ReadonlyArray<SegmentEntry>
  readonly portions: ReadonlyArray<PortionEntry>
}

export const minutesOf = ({ startedAt, endedAt }: SegmentEntry) => Math.floor((endedAt - startedAt) / MINUTE_MS)

export const sideFieldsOf = (segment: SegmentEntry, zone: string): SideFields => ({
  side: segment.side,
  start: whenAt(segment.startedAt, zone),
  minutes: minutesOf(segment),
})

export const bottleFieldsOf = ({ occurredAt, breastMilkMl, formulaMl }: PortionEntry, zone: string): BottleFields => ({
  at: whenAt(occurredAt, zone),
  breastMilkMl,
  formulaMl,
})

export const draftOf = ({ segments, portions }: Parts, zone: string): FeedDraft => ({
  sides: segments.map((base, index) => ({ key: `side-${index}`, base, fields: sideFieldsOf(base, zone) })),
  bottles: portions.map((base, index) => ({ key: `bottle-${index}`, base, fields: bottleFieldsOf(base, zone) })),
})

export const partsOf = ({ segments, portions }: Feed): Parts => ({
  segments: segments.map(({ side, startedAt, endedAt }) => ({ side, startedAt, endedAt: endedAt ?? startedAt })),
  portions: portions.map(({ occurredAt, breastMilkMl, formulaMl }) => ({ occurredAt, breastMilkMl, formulaMl })),
})

export const withSide = (draft: FeedDraft, key: string, fields: SideFields): FeedDraft => ({
  ...draft,
  sides: draft.sides.map((part) => (part.key === key ? { ...part, fields } : part)),
})

export const withBottle = (draft: FeedDraft, key: string, fields: BottleFields): FeedDraft => ({
  ...draft,
  bottles: draft.bottles.map((part) => (part.key === key ? { ...part, fields } : part)),
})

export const withoutPart = (draft: FeedDraft, key: string): FeedDraft => ({
  sides: draft.sides.filter((part) => part.key !== key),
  bottles: draft.bottles.filter((part) => part.key !== key),
})

export const withAddedSide = (draft: FeedDraft, key: string, fields: SideFields): FeedDraft => ({
  ...draft,
  sides: [...draft.sides, { key, base: null, fields }],
})

export const withAddedBottle = (draft: FeedDraft, key: string, fields: BottleFields): FeedDraft => ({
  ...draft,
  bottles: [...draft.bottles, { key, base: null, fields }],
})

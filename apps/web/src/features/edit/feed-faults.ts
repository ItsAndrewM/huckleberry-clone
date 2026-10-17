import type { SegmentEntry } from "@bt/contracts"
import { FUTURE_TOLERANCE_MS } from "@bt/domain"
import type { MessageLink } from "../../components/field-message.tsx"
import type { FeedDraft, SidePart } from "./feed-draft.ts"
import { bottleOf, type Checked, checkedParts, type DraftIssue, sideOf } from "./feed-entry.ts"
import { snapped } from "./side-snap.ts"

export type Fault = "time" | "minutes" | "amounts"

export type Faults = ReadonlyMap<string, ReadonlyArray<Fault>>

export type FaultLinks = { readonly [fault in Fault]: MessageLink | undefined }

const NO_FAULTS: Faults = new Map()
const TIME: ReadonlyArray<Fault> = ["time"]
const START_AND_MINUTES: ReadonlyArray<Fault> = ["time", "minutes"]

interface Placement {
  readonly key: string
  readonly segment: SegmentEntry
}

const late = (time: number, now: number) => time > now + FUTURE_TOLERANCE_MS

const crosses = (one: SegmentEntry, other: SegmentEntry) =>
  one !== other && one.startedAt < other.endedAt && other.startedAt < one.endedAt

const placementsOf = (sides: ReadonlyArray<SidePart>, zone: string, now: number): ReadonlyArray<Placement> => {
  const placed = sides.flatMap((part) => {
    const side = sideOf(part, zone, now)
    return side.ok ? [{ key: part.key, side: side.value }] : []
  })
  const segments = snapped(placed.map(({ side }) => side))
  return placed.flatMap(({ key }, index) => {
    const segment = segments[index]
    return segment === undefined ? [] : [{ key, segment }]
  })
}

const overlapFaults = (placements: ReadonlyArray<Placement>): Faults =>
  new Map(
    placements
      .filter(({ segment }) => placements.some((other) => crosses(segment, other.segment)))
      .map(({ key }) => [key, START_AND_MINUTES]),
  )

const futureFaults = (draft: FeedDraft, zone: string, now: number): Faults => {
  const sides = placementsOf(draft.sides, zone, now).filter(({ segment }) => late(segment.endedAt, now))
  const bottles = draft.bottles.filter((part) => {
    const bottle = bottleOf(part, zone, now)
    return bottle.ok && late(bottle.value.occurredAt, now)
  })
  return new Map([
    ...sides.map(({ key }): [string, ReadonlyArray<Fault>] => [key, START_AND_MINUTES]),
    ...bottles.map(({ key }): [string, ReadonlyArray<Fault>] => [key, TIME]),
  ])
}

const acrossFaults = (issue: DraftIssue, draft: FeedDraft, zone: string, now: number): Faults => {
  if (issue === "overlap") return overlapFaults(placementsOf(draft.sides, zone, now))
  return issue === "future" ? futureFaults(draft, zone, now) : NO_FAULTS
}

const refuses = <T>(checked: Checked<T>, issue: DraftIssue) => !checked.ok && checked.issue === issue

const refusedFields = (issue: DraftIssue): ReadonlyArray<Fault> => {
  if (issue === "minutes") return ["minutes"]
  return issue === "milk" ? ["amounts"] : TIME
}

export const faultsOf = (draft: FeedDraft, zone: string, now: number): Faults => {
  const checked = checkedParts(draft, zone, now)
  if (checked.ok) return NO_FAULTS
  const refused = [
    ...draft.sides.filter((part) => refuses(sideOf(part, zone, now), checked.issue)),
    ...draft.bottles.filter((part) => refuses(bottleOf(part, zone, now), checked.issue)),
  ]
  if (refused.length === 0) return acrossFaults(checked.issue, draft, zone, now)
  return new Map(refused.map(({ key }) => [key, refusedFields(checked.issue)]))
}

const linked = (faults: ReadonlyArray<Fault>, fault: Fault, id: string): MessageLink | undefined =>
  faults.includes(fault) ? { id, invalid: true } : undefined

export const linksTo = (id: string, faults: ReadonlyArray<Fault>): FaultLinks => ({
  time: linked(faults, "time", id),
  minutes: linked(faults, "minutes", id),
  amounts: linked(faults, "amounts", id),
})

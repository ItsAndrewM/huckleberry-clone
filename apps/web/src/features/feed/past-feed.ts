import { MAX_SEGMENT_MS, type NewFeed, type Side } from "@bt/contracts"
import { FUTURE_TOLERANCE_MS } from "@bt/domain"
import type { NumberIssue } from "../../number-messages.ts"
import type { Failed } from "../../sheets/sending.ts"
import { resolveWhen, type When, whenAt } from "../../sheets/when.ts"
import { OTHER_SIDE } from "../../sides.ts"
import type { Amounts } from "./bottle-entry.ts"

export const MINUTE_MS = 60_000
export const MAX_SIDE_MINUTES = MAX_SEGMENT_MS / MINUTE_MS
const EARLIER_MS = 30 * MINUTE_MS
const WHOLE_NUMBER = /^\d+$/u

export interface PastFeed extends Amounts {
  readonly first: Side
  readonly minutes: { readonly left: number | null; readonly right: number | null }
}

export interface PastFeedSession extends PastFeed {
  readonly actionId: string
  readonly when: When
}

const isMinutes = (minutes: number | null): minutes is number =>
  minutes !== null && Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_SIDE_MINUTES

export const minutesFromText = (text: string): number | null => {
  const typed = text.trim()
  if (typed === "") return 0
  const minutes = WHOLE_NUMBER.test(typed) ? Number(typed) : null
  return isMinutes(minutes) ? minutes : null
}

export const minutesIssue = (text: string): NumberIssue | null => {
  if (minutesFromText(text) !== null) return null
  return WHOLE_NUMBER.test(text.trim()) ? "out_of_range" : "not_a_number"
}

export const isComplete = ({ minutes, breastMilkMl, formulaMl }: PastFeed) =>
  isMinutes(minutes.left) &&
  isMinutes(minutes.right) &&
  breastMilkMl !== null &&
  formulaMl !== null &&
  minutes.left + minutes.right + breastMilkMl + formulaMl > 0

export const pastFeedEntry = (actionId: string, startedAt: number, feed: PastFeed): NewFeed => {
  const order = [feed.first, OTHER_SIDE[feed.first]]
  const segments = order.reduce<NewFeed["segments"]>((laid, side) => {
    const minutes = feed.minutes[side] ?? 0
    if (minutes === 0) return laid
    const start = laid.at(-1)?.endedAt ?? startedAt
    return [...laid, { side, startedAt: start, endedAt: start + minutes * MINUTE_MS }]
  }, [])
  const end = segments.at(-1)?.endedAt ?? startedAt
  const milk = { breastMilkMl: feed.breastMilkMl ?? 0, formulaMl: feed.formulaMl ?? 0 }
  const portions = milk.breastMilkMl + milk.formulaMl > 0 ? [{ occurredAt: end, ...milk }] : []
  return { actionId, segments, portions }
}

export const latestInstant = (startedAt: number, { minutes }: PastFeed) =>
  startedAt + ((minutes.left ?? 0) + (minutes.right ?? 0)) * MINUTE_MS

export const endsInFuture = (latest: number, now: number) => latest > now + FUTURE_TOLERANCE_MS

export const futureEnd = (feed: PastFeed, when: When, zone: string, now: number): number | null => {
  const start = resolveWhen(when, zone, now)
  if (!start.ok) return null
  const latest = latestInstant(start.instant, feed)
  return endsInFuture(latest, now) ? latest : null
}

export const canSavePastFeed = (feed: PastFeed, when: When, zone: string, now: number) =>
  isComplete(feed) && resolveWhen(when, zone, now).ok && futureEnd(feed, when, zone, now) === null

const minutesOn = (entry: NewFeed, side: Side) =>
  entry.segments
    .filter((segment) => segment.side === side)
    .reduce((total, segment) => total + (segment.endedAt - segment.startedAt) / MINUTE_MS, 0)

const freshSession = (startedAt: number, zone: string): PastFeedSession => ({
  actionId: crypto.randomUUID(),
  when: whenAt(startedAt, zone),
  first: "left",
  minutes: { left: 0, right: 0 },
  breastMilkMl: 0,
  formulaMl: 0,
})

const sentSession = (entry: NewFeed, zone: string): PastFeedSession => {
  const [segment] = entry.segments
  const [portion] = entry.portions
  const milk = portion ?? { occurredAt: 0, breastMilkMl: 0, formulaMl: 0 }
  return {
    actionId: entry.actionId,
    when: whenAt(segment === undefined ? milk.occurredAt : segment.startedAt, zone),
    first: segment?.side ?? "left",
    minutes: { left: minutesOn(entry, "left"), right: minutesOn(entry, "right") },
    breastMilkMl: milk.breastMilkMl,
    formulaMl: milk.formulaMl,
  }
}

export const pastFeedSession = (
  failed: Failed | null,
  now: number,
  zone: string,
  at: number | null,
): PastFeedSession => {
  const action = failed?.sending.action
  return action?.kind === "logFeed" ? sentSession(action.payload, zone) : freshSession(at ?? now - EARLIER_MS, zone)
}

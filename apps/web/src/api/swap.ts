import type { DayPeriod, Diaper, Feed, FeedEdit, RecentEntry, Today } from "@bt/contracts"
import { contains, feedTouches, type Instant, type Interval, last24hPeriod, sessionBounds, totalsIn } from "@bt/domain"
import type { Action } from "./actions.ts"
import { type Author, pendingId } from "./pending.ts"
import { changeOf, idOf, later, type Pending, shifted, timeOf, without, withEntry } from "./today-change.ts"

export interface Swap {
  readonly before: RecentEntry | null
  readonly after: RecentEntry | null
}

const SWAPS = new Set<Action["kind"]>(["editDiaper", "deleteDiaper", "editFeed", "deleteFeed"])

export type Swapping = Extract<Action, { readonly kind: "editDiaper" | "deleteDiaper" | "editFeed" | "deleteFeed" }>

export const isSwapping = (action: Action): action is Swapping => SWAPS.has(action.kind)

const editedFeed = (feed: Feed, { actionId, segments, portions }: FeedEdit, author: Author): Feed => {
  const id = pendingId(actionId)
  const parts = {
    segments: segments.map((segment, index) => ({ id: `${id}:segment:${index}`, ...segment })),
    portions: portions.map((portion, index) => ({ id: `${id}:portion:${index}`, ...portion })),
  }
  const bounds = sessionBounds(parts) ?? { startedAt: feed.startedAt, endedAt: feed.endedAt }
  return { ...feed, ...parts, ...bounds, updatedBy: author.by, updatedAt: author.now }
}

const editedDiaper = (diaper: Diaper, action: Extract<Swapping, { kind: "editDiaper" }>, author: Author): Diaper => {
  const { occurredAt, wet, dirty } = action.payload
  return { ...diaper, occurredAt, wet, dirty, updatedBy: author.by, updatedAt: author.now }
}

export const swappedEntry = (entry: RecentEntry, action: Swapping, author: Author): RecentEntry | null => {
  if (action.kind === "editDiaper" && entry.kind === "diaper") {
    return { kind: "diaper", diaper: editedDiaper(entry.diaper, action, author) }
  }
  if (action.kind === "editFeed" && entry.kind === "feed") {
    return { kind: "feed", feed: editedFeed(entry.feed, action.payload, author) }
  }
  return null
}

const feedsOf = (recent: ReadonlyArray<RecentEntry>) =>
  recent.flatMap((entry) => (entry.kind === "feed" ? [entry.feed] : []))

const lastFeedAfter = (today: Today, id: string, recent: ReadonlyArray<RecentEntry>, feed: Feed | null) => {
  const other = today.lastFeed?.id === id ? null : today.lastFeed
  return [...feedsOf(recent), ...(feed === null ? [] : [feed])].reduce(later, other)
}

const activeAfter = (today: Today, id: string, feed: Feed | null) => {
  if (feed?.status === "active") return feed
  return today.activeFeed?.id === id ? null : today.activeFeed
}

const swapId = ({ before, after }: Swap) => {
  const entry = before ?? after
  if (entry === null) throw new Error("A swap changes an entry, so it has one before or after it")
  return idOf(entry)
}

export const swappedToday = (today: Today, pending: Pending, swap: Swap, asOf: Instant): Today => {
  const id = swapId(swap)
  const { after } = swap
  const kept = without(today.recent, id)
  const recent = after !== null && contains(last24hPeriod(pending.now), timeOf(after)) ? withEntry(kept, after) : kept
  const feed = after?.kind === "feed" ? after.feed : null
  return {
    ...today,
    totals: shifted(today, { ...pending, now: asOf }, changeOf(swap.before), changeOf(after)),
    activeFeed: activeAfter(today, id, feed),
    lastFeed: lastFeedAfter(today, id, recent, feed),
    recent,
  }
}

const touches = (period: Interval, entry: RecentEntry, now: Instant) =>
  entry.kind === "feed" ? feedTouches(period, entry.feed, now) : contains(period, entry.diaper.occurredAt)

const inPeriod = <R extends { readonly id: string }>(
  records: ReadonlyArray<R>,
  id: string,
  record: R | null,
  at: (r: R) => number,
) => [...records.filter((one) => one.id !== id), ...(record === null ? [] : [record])].toSorted((a, b) => at(a) - at(b))

export const swappedDay = (day: DayPeriod, now: Instant, swap: Swap): DayPeriod => {
  const id = swapId(swap)
  const after = swap.after !== null && touches(day.bounds, swap.after, now) ? swap.after : null
  const feeds = inPeriod(day.feeds, id, after?.kind === "feed" ? after.feed : null, (feed) => feed.startedAt)
  const diapers = inPeriod(
    day.diapers,
    id,
    after?.kind === "diaper" ? after.diaper : null,
    (diaper) => diaper.occurredAt,
  )
  return { ...day, totals: totalsIn(day.bounds, feeds, diapers, now), feeds, diapers }
}

export const todayCopy = (today: Today, id: string): RecentEntry | null =>
  today.recent.find((entry) => idOf(entry) === id) ??
  (today.activeFeed?.id === id ? { kind: "feed", feed: today.activeFeed } : null)

export const dayCopy = (day: DayPeriod, id: string): RecentEntry | null => {
  const feed = day.feeds.find((one) => one.id === id)
  if (feed !== undefined) return { kind: "feed", feed }
  const diaper = day.diapers.find((one) => one.id === id)
  return diaper === undefined ? null : { kind: "diaper", diaper }
}

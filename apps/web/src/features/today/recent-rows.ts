import type { Diaper, Feed, RecentEntry } from "@bt/contracts"
import type { Display } from "./display.ts"
import { feedParts, feedTitle } from "./feed-parts.ts"
import { runningSide } from "./feed-status.ts"
import { clockTime } from "./format.ts"

export type RowKind = "nursing" | "bottle" | "diaper"

export interface RecentRow {
  readonly id: string
  readonly kind: RowKind
  readonly at: number
  readonly time: string
  readonly title: string
  readonly detail: ReadonlyArray<string>
  readonly by: string
}

const nameOf = ({ caregivers }: Display, id: string) =>
  caregivers.find((caregiver) => caregiver.id === id)?.displayName ?? ""

const progressOf = (feed: Feed) => {
  if (feed.status === "completed") return []
  return [runningSide(feed) === undefined ? "Paused" : "In progress"]
}

const diaperDetail = ({ wet, dirty }: Diaper) => {
  if (wet && dirty) return "Pee and poo"
  return wet ? "Pee" : "Poo"
}

const feedRow = (feed: Feed, display: Display, now: number): RecentRow => ({
  id: feed.id,
  kind: feed.segments.length === 0 ? "bottle" : "nursing",
  at: feed.startedAt,
  time: clockTime(feed.startedAt, display.timeZone, display.locale),
  title: feedTitle(feed),
  detail: [...progressOf(feed), ...feedParts(feed, display.volume, now)],
  by: nameOf(display, feed.createdBy),
})

const diaperRow = (diaper: Diaper, display: Display): RecentRow => ({
  id: diaper.id,
  kind: "diaper",
  at: diaper.occurredAt,
  time: clockTime(diaper.occurredAt, display.timeZone, display.locale),
  title: "Diaper",
  detail: [diaperDetail(diaper)],
  by: nameOf(display, diaper.createdBy),
})

export const recentRows = (recent: ReadonlyArray<RecentEntry>, display: Display, now: number) =>
  recent.map((entry) => (entry.kind === "feed" ? feedRow(entry.feed, display, now) : diaperRow(entry.diaper, display)))

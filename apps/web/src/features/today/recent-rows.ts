import type { Diaper, Feed, RecentEntry, Sleep } from "@bt/contracts"
import { isPending, isSaving } from "../../api/pending.ts"
import { clockTime } from "../../clock-time.ts"
import type { Display } from "./display.ts"
import { feedParts, feedTitle } from "./feed-parts.ts"
import { runningSide } from "./feed-status.ts"
import { sleepParts, sleepTitle } from "./sleep-parts.ts"

export type RowKind = "nursing" | "bottle" | "diaper" | "sleep"

export type RowSheet = "editDiaper" | "editFeed" | "nursing" | "editSleep" | "sleep"

export interface RecentRow {
  readonly id: string
  readonly kind: RowKind
  readonly at: number
  readonly time: string
  readonly title: string
  readonly detail: ReadonlyArray<string>
  readonly by: string
  readonly saving: boolean
  readonly opens: RowSheet | null
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

const opensFor = (feed: Feed): RowSheet | null => {
  if (isSaving(feed)) return null
  return feed.status === "completed" ? "editFeed" : "nursing"
}

const feedRow = (feed: Feed, display: Display, now: number): RecentRow => ({
  id: feed.id,
  kind: feed.segments.length === 0 ? "bottle" : "nursing",
  at: feed.startedAt,
  time: clockTime(feed.startedAt, display.timeZone, display.locale),
  title: feedTitle(feed),
  detail: [...progressOf(feed), ...feedParts(feed, display.volume, now)],
  by: nameOf(display, feed.createdBy),
  saving: isSaving(feed),
  opens: opensFor(feed),
})

const diaperRow = (diaper: Diaper, display: Display): RecentRow => ({
  id: diaper.id,
  kind: "diaper",
  at: diaper.occurredAt,
  time: clockTime(diaper.occurredAt, display.timeZone, display.locale),
  title: "Diaper",
  detail: [diaperDetail(diaper)],
  by: nameOf(display, diaper.createdBy),
  saving: isPending(diaper.id),
  opens: isPending(diaper.id) ? null : "editDiaper",
})

const sleepOpens = (sleep: Sleep): RowSheet | null => {
  if (isPending(sleep.id)) return null
  return sleep.endedAt === null ? "sleep" : "editSleep"
}

const sleepRow = (sleep: Sleep, display: Display, now: number): RecentRow => ({
  id: sleep.id,
  kind: "sleep",
  at: sleep.startedAt,
  time: clockTime(sleep.startedAt, display.timeZone, display.locale),
  title: sleepTitle(sleep),
  detail: sleepParts(sleep, display.timeZone, now, display.locale),
  by: nameOf(display, sleep.createdBy),
  saving: isPending(sleep.id),
  opens: sleepOpens(sleep),
})

export const recentRow = (entry: RecentEntry, display: Display, now: number) => {
  switch (entry.kind) {
    case "feed":
      return feedRow(entry.feed, display, now)
    case "diaper":
      return diaperRow(entry.diaper, display)
    case "sleep":
      return sleepRow(entry.sleep, display, now)
  }
}

const whileBusy = (row: RecentRow, busy: string | null): RecentRow =>
  row.id === busy ? { ...row, saving: true, opens: null } : row

export const recentRows = (recent: ReadonlyArray<RecentEntry>, display: Display, now: number, busy: string | null) =>
  recent.map((entry) => whileBusy(recentRow(entry, display, now), busy))

import type { Feed } from "@bt/contracts"
import { feedSummary, sessionBounds } from "@bt/domain"
import type { Display } from "../today/display.ts"
import { feedTitle } from "../today/feed-parts.ts"
import { formatMinutes, formatVolume, presentParts } from "../today/format.ts"
import type { Entry } from "./day-model.ts"
import { diaperText } from "./entry-labels.ts"

export interface EntryDetails {
  readonly id: string
  readonly title: string
  readonly when: string
  readonly lines: ReadonlyArray<string>
  readonly by: string
}

const MS_PER_SECOND = 1000

const whenOf = (start: number, end: number, display: Display) => {
  const format = new Intl.DateTimeFormat(display.locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: display.timeZone,
  })
  return end > start ? format.formatRange(start, end) : format.format(start)
}

const byOf = ({ caregivers }: Display, id: string) => {
  const name = caregivers.find((caregiver) => caregiver.id === id)?.displayName
  return name === undefined ? "" : `Logged by ${name}`
}

const pausedSeconds = (feed: Feed, now: number) => {
  const span = sessionBounds(feed)
  if (span === null || feed.segments.length === 0) return 0
  const nursed = feedSummary(feed, now).nursingSeconds
  const lastSide = Math.max(...feed.segments.map(({ endedAt }) => endedAt ?? now))
  return Math.max(0, Math.floor((lastSide - span.startedAt) / MS_PER_SECOND) - nursed)
}

const statusOf = (feed: Feed) => {
  if (feed.status === "completed") return []
  return [feed.segments.some(({ endedAt }) => endedAt === null) ? "In progress" : "Paused"]
}

const bottleLines = (bottleMl: number, breastMilkMl: number, formulaMl: number, { volume }: Display) => {
  if (bottleMl === 0) return []
  const bottle = `Bottle ${formatVolume(bottleMl, volume)}`
  if (formulaMl === 0) return [`${bottle} breast milk`]
  if (breastMilkMl === 0) return [`${bottle} formula`]
  return [`${bottle}: breast milk ${formatVolume(breastMilkMl, volume)} · formula ${formatVolume(formulaMl, volume)}`]
}

const feedLines = (feed: Feed, display: Display, now: number) => {
  const { leftSeconds, rightSeconds, bottleMl, breastMilkMl, formulaMl } = feedSummary(feed, now)
  const paused = pausedSeconds(feed, now)
  const sides = presentParts([
    [leftSeconds, `Left ${formatMinutes(leftSeconds)}`],
    [rightSeconds, `Right ${formatMinutes(rightSeconds)}`],
  ])
  return [
    ...statusOf(feed),
    ...(sides.length === 0 ? [] : [sides.join(" · ")]),
    ...(paused === 0 ? [] : [`Paused ${formatMinutes(paused)}`]),
    ...bottleLines(bottleMl, breastMilkMl, formulaMl, display),
  ]
}

const feedDetails = (feed: Feed, display: Display, now: number): EntryDetails => {
  const span = sessionBounds(feed)
  const end = span?.endedAt ?? now
  return {
    id: feed.id,
    title: feedTitle(feed),
    when: whenOf(feed.startedAt, end, display),
    lines: feedLines(feed, display, now),
    by: byOf(display, feed.createdBy),
  }
}

export const entryDetails = (entry: Entry, display: Display, now: number): EntryDetails => {
  if (entry.kind === "feed") return feedDetails(entry.feed, display, now)
  const { diaper } = entry
  return {
    id: diaper.id,
    title: "Diaper",
    when: whenOf(diaper.occurredAt, diaper.occurredAt, display),
    lines: [diaperText(diaper)],
    by: byOf(display, diaper.createdBy),
  }
}

import type { Diaper, Feed, RecentEntry, Sleep, VolumeUnit } from "@bt/contracts"
import { feedSummary, sleepElapsed } from "@bt/domain"
import { clockTime } from "../../clock-time.ts"
import type { Display } from "../today/display.ts"
import { feedParts, feedTitle } from "../today/feed-parts.ts"
import { formatVolume, presentParts } from "../today/format.ts"
import { sleepParts, sleepTitle } from "../today/sleep-parts.ts"
import type { Entry } from "./day-model.ts"

const MINUTE_S = 60
const HOUR_MIN = 60

export const shortMinutes = (seconds: number) => {
  if (seconds > 0 && seconds < MINUTE_S) return "<1m"
  const minutes = Math.floor(seconds / MINUTE_S)
  const hours = Math.floor(minutes / HOUR_MIN)
  const rest = minutes % HOUR_MIN
  if (hours === 0) return `${minutes}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const diaperText = ({ wet, dirty }: Diaper) => {
  if (wet && dirty) return "Pee and poo"
  return wet ? "Pee" : "Poo"
}

const progressOf = (feed: Feed, running: string) => {
  if (feed.status === "completed") return []
  return [feed.segments.some(({ endedAt }) => endedAt === null) ? running : "paused"]
}

export const blockText = (feed: Feed, volume: VolumeUnit, now: number) => {
  const { leftSeconds, rightSeconds, bottleMl } = feedSummary(feed, now)
  const parts = presentParts([
    [leftSeconds, `${shortMinutes(leftSeconds)} L`],
    [rightSeconds, `${shortMinutes(rightSeconds)} R`],
    [bottleMl, formatVolume(bottleMl, volume)],
  ])
  const nursed = parts.length === 0 ? "Nursing" : `Nursing ${parts.join(" · ")}`
  return [nursed, ...progressOf(feed, "now")].join(" · ")
}

const diaperChip = ({ wet, dirty }: Diaper) => {
  if (wet && dirty) return "Both"
  return wet ? "Pee" : "Poo"
}

export const markerText = (entry: Entry, volume: VolumeUnit, now: number) => {
  switch (entry.kind) {
    case "diaper":
      return diaperChip(entry.diaper)
    case "feed":
      return formatVolume(feedSummary(entry.feed, now).bottleMl, volume)
    case "sleep":
      return sleepTitle(entry.sleep)
  }
}

const sleepName = (sleep: Sleep, display: Display, now: number) =>
  `${sleepTitle(sleep)} at ${clockTime(sleep.startedAt, display.timeZone, display.locale)}: ${sleepParts(sleep, display.timeZone, now, display.locale).join(", ")}`

export const entryName = (entry: RecentEntry, display: Display, now: number) => {
  const time = (at: number) => clockTime(at, display.timeZone, display.locale)
  if (entry.kind === "diaper") return `Diaper at ${time(entry.diaper.occurredAt)}: ${diaperText(entry.diaper)}`
  if (entry.kind === "sleep") return sleepName(entry.sleep, display, now)
  const { feed } = entry
  const details = [...progressOf(feed, "in progress"), ...feedParts(feed, display.volume, now)]
  const name = `${feedTitle(feed)} at ${time(feed.startedAt)}`
  return details.length === 0 ? name : `${name}: ${details.join(", ")}`
}

export const clusterName = (count: number, first: number, display: Display) =>
  `${count} entries from ${clockTime(first, display.timeZone, display.locale)}`

export const compactLength = (seconds: number) => {
  if (seconds < MINUTE_S) return "<1m"
  const minutes = Math.floor(seconds / MINUTE_S)
  const hours = Math.floor(minutes / HOUR_MIN)
  const rest = minutes % HOUR_MIN
  if (hours === 0) return `${minutes}m`
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`
}

export const sleepBlockText = (sleep: Sleep, now: number) => ({
  title: sleepTitle(sleep),
  length: sleep.endedAt === null ? "now" : compactLength(sleepElapsed(sleep, now)),
})

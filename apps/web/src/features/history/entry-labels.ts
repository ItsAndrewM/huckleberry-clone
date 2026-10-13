import type { Diaper, Dose, Feed, VolumeUnit } from "@bt/contracts"
import { feedSummary } from "@bt/domain"
import { clockTime } from "../../clock-time.ts"
import { type Display, supplementName } from "../today/display.ts"
import { feedParts, feedTitle } from "../today/feed-parts.ts"
import { formatVolume, presentParts } from "../today/format.ts"
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

export const markerText = (entry: Entry, display: Display, now: number) => {
  switch (entry.kind) {
    case "diaper":
      return diaperChip(entry.diaper)
    case "dose":
      return supplementName(display, entry.dose.supplementId)
    case "feed":
      return formatVolume(feedSummary(entry.feed, now).bottleMl, display.volume)
  }
}

const doseName = (dose: Dose, display: Display, time: string) => {
  const name = `${supplementName(display, dose.supplementId)} at ${time}`
  return dose.dose === "" ? name : `${name}: ${dose.dose}`
}

export const entryName = (entry: Entry, display: Display, now: number) => {
  const time = (at: number) => clockTime(at, display.timeZone, display.locale)
  if (entry.kind === "diaper") return `Diaper at ${time(entry.diaper.occurredAt)}: ${diaperText(entry.diaper)}`
  if (entry.kind === "dose") return doseName(entry.dose, display, time(entry.dose.occurredAt))
  const { feed } = entry
  const details = [...progressOf(feed, "in progress"), ...feedParts(feed, display.volume, now)]
  const name = `${feedTitle(feed)} at ${time(feed.startedAt)}`
  return details.length === 0 ? name : `${name}: ${details.join(", ")}`
}

export const clusterName = (count: number, first: number, display: Display) =>
  `${count} entries from ${clockTime(first, display.timeZone, display.locale)}`

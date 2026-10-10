import type { Feed, VolumeUnit } from "@bt/contracts"
import { feedSummary } from "@bt/domain"
import { formatMinutes, formatVolume, presentParts } from "./format.ts"

export const feedTitle = (feed: Feed) => {
  if (feed.portions.length === 0) return "Nursing"
  return feed.segments.length === 0 ? "Bottle" : "Nursing and bottle"
}

export const feedParts = (feed: Feed, volume: VolumeUnit, now: number) => {
  const { leftSeconds, rightSeconds, bottleMl } = feedSummary(feed, now)
  return presentParts([
    [leftSeconds, `Left ${formatMinutes(leftSeconds)}`],
    [rightSeconds, `Right ${formatMinutes(rightSeconds)}`],
    [bottleMl, formatVolume(bottleMl, volume)],
  ])
}

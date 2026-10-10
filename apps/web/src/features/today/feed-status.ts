import type { Feed, Side, Today } from "@bt/contracts"
import { feedSummary } from "@bt/domain"

export type FeedStatus =
  | { readonly kind: "running"; readonly feed: Feed; readonly side: Side; readonly nursingSeconds: number }
  | { readonly kind: "paused"; readonly feed: Feed; readonly nursingSeconds: number }
  | { readonly kind: "since"; readonly feed: Feed; readonly seconds: number }
  | { readonly kind: "none" }

const SECOND_MS = 1000

export const runningSide = (feed: Feed): Side | undefined =>
  feed.segments.find((segment) => segment.endedAt === null)?.side

const activeStatus = (feed: Feed, now: number): FeedStatus => {
  const { nursingSeconds } = feedSummary(feed, now)
  const side = runningSide(feed)
  return side === undefined ? { kind: "paused", feed, nursingSeconds } : { kind: "running", feed, side, nursingSeconds }
}

export const feedStatus = ({ activeFeed, lastFeed }: Pick<Today, "activeFeed" | "lastFeed">, now: number) => {
  if (activeFeed !== null) return activeStatus(activeFeed, now)
  if (lastFeed === null) return { kind: "none" } satisfies FeedStatus
  const seconds = Math.max(0, Math.floor((now - lastFeed.startedAt) / SECOND_MS))
  return { kind: "since", feed: lastFeed, seconds } satisfies FeedStatus
}

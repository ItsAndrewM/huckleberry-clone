import { describe, expect, it } from "vitest"
import { feedStatus } from "../src/features/today/feed-status.ts"
import { feedAt, MINUTE, NOW, nursedFor } from "./today-fixtures.ts"

const running = (startedAt: number) => {
  const nursed = nursedFor(feedAt(startedAt, { status: "active" }), "right", 10)
  const open = { id: "open", side: "left" as const, startedAt: nursed.endedAt ?? startedAt, endedAt: null }
  return { ...nursed, endedAt: null, segments: [...nursed.segments, open] }
}

describe("feedStatus", () => {
  it("has nothing to show before the first feed", () => {
    expect(feedStatus({ activeFeed: null, lastFeed: null }, NOW)).toEqual({ kind: "none" })
  })

  it("counts the time since the last feed started, in whole seconds", () => {
    const lastFeed = feedAt(NOW - 134 * MINUTE - 999)
    expect(feedStatus({ activeFeed: null, lastFeed }, NOW)).toEqual({
      kind: "since",
      feed: lastFeed,
      seconds: 134 * 60,
    })
  })

  it("never counts below zero when the phone's clock is behind the household's", () => {
    const lastFeed = feedAt(NOW + MINUTE)
    expect(feedStatus({ activeFeed: null, lastFeed }, NOW)).toMatchObject({ kind: "since", seconds: 0 })
  })

  it("shows a running feed's side and its nursing so far, the running side up to now", () => {
    const feed = running(NOW - 15 * MINUTE)
    expect(feedStatus({ activeFeed: feed, lastFeed: feed }, NOW)).toEqual({
      kind: "running",
      feed,
      side: "left",
      nursingSeconds: 15 * 60,
    })
  })

  it("shows a paused feed's nursing, which stops counting", () => {
    const feed = nursedFor(feedAt(NOW - 30 * MINUTE, { status: "active", endedAt: null }), "left", 12)
    expect(feedStatus({ activeFeed: feed, lastFeed: feed }, NOW)).toEqual({
      kind: "paused",
      feed,
      nursingSeconds: 12 * 60,
    })
  })
})

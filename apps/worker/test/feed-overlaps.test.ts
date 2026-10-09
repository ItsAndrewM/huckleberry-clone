import { describe, expect, it } from "vitest"
import { NO_EXCLUSION, overlappedFeed } from "../src/core/feeds/rules.ts"
import { createFeed } from "../src/core/feeds/store.ts"
import { segment } from "./feed-fixtures.ts"
import { inHousehold, MINUTE_MS, minutesAgo, NOW, stampOf } from "./fixtures.ts"

const completed = (sql: SqlStorage, from: number, to: number) =>
  createFeed(sql, stampOf(sql), "completed", [segment("left", minutesAgo(from), minutesAgo(to))], [])

const running = (sql: SqlStorage, from: number) =>
  createFeed(sql, stampOf(sql), "active", [{ side: "left", startedAt: minutesAgo(from), endedAt: null }], [])

const between = (from: number, to: number) => ({ startedAt: minutesAgo(from), endedAt: minutesAgo(to) })

const ahead = (from: number, to: number) => ({ startedAt: NOW + from * MINUTE_MS, endedAt: NOW + to * MINUTE_MS })

describe("the overlap check (D9)", () => {
  it("finds the feed whose segment overlaps, taking the earliest when several do", async () => {
    const { earlier, found } = await inHousehold((sql) => {
      const earlier = completed(sql, 90, 70)
      completed(sql, 70, 50)
      return { earlier, found: overlappedFeed(sql, [between(80, 60)], NOW, NO_EXCLUSION) }
    })
    expect(found).toEqual(earlier)
  })

  it("lets segments meet end to start, since each runs up to its end but not through it", async () => {
    const found = await inHousehold((sql) => {
      completed(sql, 90, 70)
      return overlappedFeed(sql, [between(70, 60), between(100, 90)], NOW, NO_EXCLUSION)
    })
    expect(found).toBeUndefined()
  })

  it("ignores deleted segments, and the segments of deleted feeds", async () => {
    const found = await inHousehold((sql) => {
      const deletedFeed = completed(sql, 90, 70)
      sql.exec("UPDATE feeds SET deleted_at = ? WHERE id = ?", NOW, deletedFeed.id)
      completed(sql, 60, 40)
      sql.exec("UPDATE nursing_segments SET deleted_at = ? WHERE started_at = ?", NOW, minutesAgo(60))
      return overlappedFeed(sql, [between(80, 50)], NOW, NO_EXCLUSION)
    })
    expect(found).toBeUndefined()
  })

  it("leaves out the segment or the feed it's told to exclude", async () => {
    const found = await inHousehold((sql) => {
      const feed = completed(sql, 90, 70)
      const own = sql.exec<{ id: string }>("SELECT id FROM nursing_segments").one().id
      return {
        exceptSegment: overlappedFeed(sql, [between(80, 60)], NOW, { feedId: null, segmentId: own }),
        exceptFeed: overlappedFeed(sql, [between(80, 60)], NOW, { feedId: feed.id, segmentId: null }),
        exceptOther: overlappedFeed(sql, [between(80, 60)], NOW, { feedId: "another-feed", segmentId: "another" }),
      }
    })
    expect(found).toMatchObject({
      exceptSegment: undefined,
      exceptFeed: undefined,
      exceptOther: { status: "completed" },
    })
  })

  it("treats a running segment as reaching 5 minutes past now, for a phone whose clock runs fast (AC 21)", async () => {
    const found = await inHousehold((sql) => {
      running(sql, 10)
      return {
        within: overlappedFeed(sql, [ahead(4, 6)], NOW, NO_EXCLUSION),
        beyond: overlappedFeed(sql, [ahead(5, 6)], NOW, NO_EXCLUSION),
      }
    })
    expect(found).toMatchObject({ within: { status: "active" }, beyond: undefined })
  })

  it("treats a segment with no end as one that runs to 5 minutes past now", async () => {
    const found = await inHousehold((sql) => {
      const { startedAt, endedAt } = ahead(2, 4)
      createFeed(sql, stampOf(sql), "completed", [segment("left", startedAt, endedAt)], [])
      return {
        reaches: overlappedFeed(sql, [{ startedAt: minutesAgo(1), endedAt: null }], NOW, NO_EXCLUSION),
        endsFirst: overlappedFeed(sql, [{ startedAt: minutesAgo(1), endedAt: minutesAgo(0) }], NOW, NO_EXCLUSION),
      }
    })
    expect(found).toMatchObject({ reaches: { status: "completed" }, endsFirst: undefined })
  })
})

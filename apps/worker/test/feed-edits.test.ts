import type { Feed } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { deleteFeed, moveFeed, restoreFeed } from "../src/core/feeds/feed-edits.ts"
import { finishFeed, startFeed } from "../src/core/feeds/lifecycle.ts"
import { logFeed } from "../src/core/feeds/log.ts"
import { loadFeed } from "../src/core/feeds/store.ts"
import type { Stamp } from "../src/core/receipts.ts"
import {
  bottle,
  CHANGED_SUNDAY_AND_MONDAY,
  newFeed,
  PAST_FEED_WITH_ITS_BOTTLE_AT_MIDNIGHT,
  segment,
  WEDNESDAY_OCT_14_NOON,
} from "./feed-fixtures.ts"
import {
  ACTION_ID,
  ANDREW,
  BIRTH_DATE_BEGINS,
  CHANGED_TODAY,
  caregiverId,
  EMILY,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NOW,
  saved,
  stampOf,
} from "./fixtures.ts"

const SEP_30_AT_23_00 = Date.UTC(2026, 9, 1, 6)
const OCT_1_AT_01_00 = Date.UTC(2026, 9, 1, 8)

const logged = (sql: SqlStorage, from = 60) =>
  saved(
    logFeed(
      stampOf(sql),
      newFeed(
        [
          segment("left", minutesAgo(from), minutesAgo(from - 15)),
          segment("right", minutesAgo(from - 15), minutesAgo(from - 30)),
        ],
        [bottle(minutesAgo(from - 35), 40, 20)],
      ),
    )(sql),
  )

const running = (sql: SqlStorage, startedAt = minutesAgo(20)) =>
  saved(startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt })(sql))

const move = (feed: Feed, startedAt: number) => ({ actionId: ACTION_ID, version: feed.version, startedAt })

const versioned = (feed: Feed) => ({ actionId: ACTION_ID, version: feed.version })

describe("moving a feed", () => {
  it("moves the whole feed to start at the new time, shifting every segment and bottle by as much", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const before = logged(sql, 60)
      const after = saved(moveFeed(stampOf(sql, EMILY.email), before.id, move(before, minutesAgo(90)))(sql))
      return { before, after, emily: caregiverId(sql, EMILY.email) }
    })
    expect(after).toEqual({
      ...before,
      startedAt: minutesAgo(90),
      endedAt: minutesAgo(55),
      segments: [
        { ...before.segments[0], startedAt: minutesAgo(90), endedAt: minutesAgo(75) },
        { ...before.segments[1], startedAt: minutesAgo(75), endedAt: minutesAgo(60) },
      ],
      portions: [{ ...before.portions[0], occurredAt: minutesAgo(55) }],
      version: 2,
      updatedBy: emily,
    })
  })

  it("invalidates both days and both months when a feed moves from the last of a month to the first (AC 17)", async () => {
    const result = await inHousehold((sql) => {
      const lastOfSeptember = segment("left", SEP_30_AT_23_00, SEP_30_AT_23_00 + 15 * MINUTE_MS)
      const feed = saved(logFeed(stampOf(sql), newFeed([lastOfSeptember]))(sql))
      return moveFeed(stampOf(sql), feed.id, move(feed, OCT_1_AT_01_00))(sql)
    })
    expect(result.ok && result.changed).toEqual([
      ["today"],
      ["last24h"],
      ["day", "2026-09-30"],
      ["day", "2026-10-01"],
      ["week", "2026-W40"],
      ["month", "2026-09"],
      ["month", "2026-10"],
    ])
  })

  it("moves a running feed, which keeps running from its new start", async () => {
    const feed = await inHousehold((sql) => {
      const feed = running(sql, minutesAgo(20))
      return saved(moveFeed(stampOf(sql), feed.id, move(feed, minutesAgo(30)))(sql))
    })
    expect(feed).toMatchObject({
      status: "active",
      startedAt: minutesAgo(30),
      endedAt: null,
      segments: [{ startedAt: minutesAgo(30), endedAt: null }],
    })
  })

  it("throws, as a defect, for a feed with no segment or bottle left, rather than refusing the move as a bad request", async () => {
    await inHousehold((sql) => {
      const feed = logged(sql)
      sql.exec("UPDATE nursing_segments SET deleted_at = ?", NOW)
      sql.exec("UPDATE bottle_portions SET deleted_at = ?", NOW)
      expect(() => moveFeed(stampOf(sql), feed.id, move(feed, minutesAgo(90)))(sql)).toThrow(
        `Feed ${feed.id} has no nursing segment or bottle`,
      )
    })
  })

  it("moves a feed onto part of where it was, since a feed can't overlap itself", async () => {
    const result = await inHousehold((sql) => {
      const feed = logged(sql, 60)
      return moveFeed(stampOf(sql), feed.id, move(feed, minutesAgo(50)))(sql)
    })
    expect(result.ok).toBe(true)
  })

  it.each([
    ["any part more than 5 minutes ahead of the server's clock", minutesAgo(29), "in_future"],
    ["its start before the birth date began", BIRTH_DATE_BEGINS - MINUTE_MS, "before_birth"],
  ])("refuses a move that would put %s, naming startedAt", async (_label, startedAt, issue) => {
    const result = await inHousehold((sql) => {
      const feed = logged(sql, 60)
      return moveFeed(stampOf(sql), feed.id, move(feed, startedAt))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "startedAt", issue }] } })
  })

  it("refuses a move onto another feed's segment, with SEGMENT_OVERLAP and that feed, changing nothing (D9)", async () => {
    const { feed, other, result, after } = await inHousehold((sql) => {
      const other = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(200), minutesAgo(180))]))(sql))
      const feed = logged(sql, 60)
      const result = moveFeed(stampOf(sql), feed.id, move(feed, minutesAgo(190)))(sql)
      return { feed, other, result, after: loadFeed(sql, feed.id) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: other }) })
    expect(after).toEqual(feed)
  })

  it("refuses a move of a running feed back over another feed's segment, with SEGMENT_OVERLAP and that feed (D9)", async () => {
    const { other, result } = await inHousehold((sql) => {
      const other = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(60), minutesAgo(45))]))(sql))
      const feed = running(sql, minutesAgo(20))
      return { other, result: moveFeed(stampOf(sql), feed.id, move(feed, minutesAgo(50)))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: other }) })
  })

  it("refuses a move of a feed the other parent just deleted with STALE_VERSION, showing it deleted", async () => {
    const result = await inHousehold((sql) => {
      const feed = logged(sql)
      saved(deleteFeed(stampOf(sql, EMILY.email), feed.id, versioned(feed))(sql))
      return moveFeed(stampOf(sql), feed.id, move(feed, minutesAgo(90)))(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { version: 2, deletedAt: NOW } },
    })
  })
})

describe("deleting and restoring a feed", () => {
  it("deletes it softly with its parts, bumping the version and invalidating the deleted list", async () => {
    const { feed, result } = await inHousehold((sql) => {
      const feed = logged(sql)
      return { feed, result: deleteFeed(stampOf(sql), feed.id, versioned(feed))(sql) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...feed, version: 2, deletedAt: NOW },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("names Monday's day and week when it deletes a past feed from Sunday night whose bottle came at midnight", async () => {
    const result = await inHousehold((sql) => {
      const stamp = stampOf(sql, ANDREW.email, WEDNESDAY_OCT_14_NOON)
      const feed = saved(logFeed(stamp, PAST_FEED_WITH_ITS_BOTTLE_AT_MIDNIGHT)(sql))
      return deleteFeed(stamp, feed.id, versioned(feed))(sql)
    })
    expect(result.ok && result.changed).toEqual([...CHANGED_SUNDAY_AND_MONDAY, ["deleted"]])
  })

  it("restores it as it was, with a new version and no deletedAt (AC 19)", async () => {
    const { feed, restored } = await inHousehold((sql) => {
      const feed = logged(sql)
      const deleted = saved(deleteFeed(stampOf(sql), feed.id, versioned(feed))(sql))
      return { feed, restored: restoreFeed(stampOf(sql), feed.id, versioned(deleted))(sql) }
    })
    expect(restored).toEqual({
      ok: true,
      response: { ...feed, version: 3 },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("restores a feed deleted as it stood with its running side, which still runs from where it started", async () => {
    const { feed, restored } = await inHousehold((sql) => {
      const feed = running(sql, minutesAgo(20))
      const finish = { actionId: ACTION_ID, version: 1, occurredAt: minutesAgo(20), deleteIfEmpty: true }
      const deleted = saved(finishFeed(stampOf(sql), feed.id, finish)(sql))
      return { feed, restored: saved(restoreFeed(stampOf(sql), feed.id, versioned(deleted))(sql)) }
    })
    expect(restored).toEqual({ ...feed, version: 3 })
  })

  it("refuses to restore an active feed while another is active, with FEED_ALREADY_ACTIVE and that feed (D10)", async () => {
    const { other, result } = await inHousehold((sql) => {
      const feed = running(sql, minutesAgo(40))
      const deleted = saved(deleteFeed(stampOf(sql), feed.id, versioned(feed))(sql))
      const other = running(sql, minutesAgo(5))
      return { other, result: restoreFeed(stampOf(sql), feed.id, versioned(deleted))(sql) }
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "FEED_ALREADY_ACTIVE", current: other }),
    })
  })

  it("refuses a restore that would overlap a segment saved since, with SEGMENT_OVERLAP and that feed (D10)", async () => {
    const { other, result } = await inHousehold((sql) => {
      const feed = logged(sql, 60)
      const deleted = saved(deleteFeed(stampOf(sql), feed.id, versioned(feed))(sql))
      const other = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(50), minutesAgo(40))]))(sql))
      return { other, result: restoreFeed(stampOf(sql), feed.id, versioned(deleted))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: other }) })
  })

  it("refuses to restore a running feed over a segment saved inside its running side, with SEGMENT_OVERLAP and that feed (D10)", async () => {
    const { other, result } = await inHousehold((sql) => {
      const feed = running(sql, minutesAgo(30))
      const deleted = saved(deleteFeed(stampOf(sql), feed.id, versioned(feed))(sql))
      const other = saved(logFeed(stampOf(sql), newFeed([segment("right", minutesAgo(20), minutesAgo(10))]))(sql))
      return { other, result: restoreFeed(stampOf(sql), feed.id, versioned(deleted))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: other }) })
  })

  it.each([
    ["a delete of a feed that's already deleted", true],
    ["a restore of a feed that isn't deleted", false],
  ])("answers NotFound to %s, even from its current version", async (_label, deleteFirst) => {
    const result = await inHousehold((sql) => {
      const feed = logged(sql)
      if (!deleteFirst) return restoreFeed(stampOf(sql), feed.id, versioned(feed))(sql)
      const deleted = saved(deleteFeed(stampOf(sql), feed.id, versioned(feed))(sql))
      return deleteFeed(stampOf(sql), feed.id, versioned(deleted))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  const unknown = "no-such-feed"
  it.each([
    ["a move", (stamp: Stamp) => moveFeed(stamp, unknown, { actionId: ACTION_ID, version: 1, startedAt: NOW })],
    ["a delete", (stamp: Stamp) => deleteFeed(stamp, unknown, { actionId: ACTION_ID, version: 1 })],
    ["a restore", (stamp: Stamp) => restoreFeed(stamp, unknown, { actionId: ACTION_ID, version: 1 })],
  ])("answers NotFound to %s of a feed that never existed", async (_label, core) => {
    const result = await inHousehold((sql) => {
      logged(sql)
      return core(stampOf(sql))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

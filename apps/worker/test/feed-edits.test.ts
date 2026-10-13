import type { Feed } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { deletedOf } from "../src/core/deleted.ts"
import { deleteFeed, editFeed, moveFeed, restoreFeed } from "../src/core/feeds/feed-edits.ts"
import { finishFeed, startFeed } from "../src/core/feeds/lifecycle.ts"
import { logFeed } from "../src/core/feeds/log.ts"
import { loadFeed } from "../src/core/feeds/store.ts"
import type { Stamp } from "../src/core/receipts.ts"
import {
  bottle,
  CHANGED_SUNDAY_AND_MONDAY,
  newFeed,
  PAST_FEED_WITH_ITS_BOTTLE_AT_MIDNIGHT,
  rowCount,
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
  movedBirthDate,
  movedZone,
  NOW,
  SEP_3_BEGINS,
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

const edit = (feed: Feed, parts: ReturnType<typeof newFeed>) => ({ ...parts, version: feed.version })

const timesOf = (feed: Feed) => ({
  segments: feed.segments.map(({ side, startedAt, endedAt }) => ({ side, startedAt, endedAt })),
  portions: feed.portions.map(({ occurredAt, breastMilkMl, formulaMl }) => ({ occurredAt, breastMilkMl, formulaMl })),
})

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

describe("editing a whole feed", () => {
  const SWITCHED_EARLIER = newFeed(
    [segment("left", minutesAgo(60), minutesAgo(50)), segment("right", minutesAgo(50), minutesAgo(30))],
    [bottle(minutesAgo(25), 50, 20)],
  )

  it("replaces its sides and bottles in one save, keeping its id and who logged it, so a switch can move earlier (D9)", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const before = logged(sql, 60)
      const after = saved(editFeed(stampOf(sql, EMILY.email), before.id, edit(before, SWITCHED_EARLIER))(sql))
      return { before, after, emily: caregiverId(sql, EMILY.email) }
    })
    expect(timesOf(after)).toEqual({ segments: SWITCHED_EARLIER.segments, portions: SWITCHED_EARLIER.portions })
    expect(after).toMatchObject({
      id: before.id,
      status: "completed",
      startedAt: minutesAgo(60),
      endedAt: minutesAgo(25),
      version: 2,
      createdBy: before.createdBy,
      updatedBy: emily,
      deletedAt: null,
    })
  })

  it("keeps the sides and bottles it replaced as deleted rows, so the export still shows what the feed held", async () => {
    const counts = await inHousehold((sql) => {
      const before = logged(sql, 60)
      saved(editFeed(stampOf(sql), before.id, edit(before, SWITCHED_EARLIER))(sql))
      const deleted = (table: string) =>
        sql.exec<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE deleted_at = ?`, NOW).one().n
      return {
        segments: [rowCount(sql, "nursing_segments"), deleted("nursing_segments")],
        portions: [rowCount(sql, "bottle_portions"), deleted("bottle_portions")],
      }
    })
    expect(counts).toEqual({ segments: [4, 2], portions: [2, 1] })
  })

  it("adds a side or a bottle the parent forgot, and drops one they remove", async () => {
    const after = await inHousehold((sql) => {
      const before = logged(sql, 60)
      const parts = newFeed(
        [segment("left", minutesAgo(60), minutesAgo(45))],
        [bottle(minutesAgo(40)), bottle(minutesAgo(30))],
      )
      return saved(editFeed(stampOf(sql), before.id, edit(before, parts))(sql))
    })
    expect(timesOf(after)).toEqual({
      segments: [{ side: "left", startedAt: minutesAgo(60), endedAt: minutesAgo(45) }],
      portions: [
        { occurredAt: minutesAgo(40), breastMilkMl: 60, formulaMl: 0 },
        { occurredAt: minutesAgo(30), breastMilkMl: 60, formulaMl: 0 },
      ],
    })
  })

  it("names both days and both months when the edit moves the feed from the last of a month to the first (AC 17)", async () => {
    const result = await inHousehold((sql) => {
      const lastOfSeptember = segment("left", SEP_30_AT_23_00, SEP_30_AT_23_00 + 15 * MINUTE_MS)
      const feed = saved(logFeed(stampOf(sql), newFeed([lastOfSeptember]))(sql))
      const firstOfOctober = segment("left", OCT_1_AT_01_00, OCT_1_AT_01_00 + 15 * MINUTE_MS)
      return editFeed(stampOf(sql), feed.id, edit(feed, newFeed([firstOfOctober])))(sql)
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

  it.each([
    [
      "a side ending more than 5 minutes ahead of the server's clock",
      newFeed([segment("left", minutesAgo(10), NOW + 6 * MINUTE_MS)]),
      [{ path: "segments.0.endedAt", issue: "in_future" }],
    ],
    [
      "a bottle before the birth date began",
      newFeed([], [bottle(BIRTH_DATE_BEGINS - MINUTE_MS)]),
      [{ path: "portions.0.occurredAt", issue: "before_birth" }],
    ],
    [
      "two of its own sides at once",
      newFeed([segment("left", minutesAgo(60), minutesAgo(40)), segment("right", minutesAgo(50), minutesAgo(30))]),
      [{ path: "segments", issue: "invalid" }],
    ],
  ])("refuses %s, changing nothing", async (_label, parts, fieldErrors) => {
    const { before, result, after } = await inHousehold((sql) => {
      const before = logged(sql, 60)
      const result = editFeed(stampOf(sql), before.id, edit(before, parts))(sql)
      return { before, result, after: loadFeed(sql, before.id) }
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors } })
    expect(after).toEqual(before)
  })

  it("edits a feed a zone change left before the birth date while each time stays, but won't move a part to another time there", async () => {
    const results = await inHousehold((sql) => {
      const atBirth = newFeed(
        [segment("left", BIRTH_DATE_BEGINS, BIRTH_DATE_BEGINS + 10 * MINUTE_MS)],
        [bottle(BIRTH_DATE_BEGINS + 15 * MINUTE_MS)],
      )
      const before = saved(logFeed(stampOf(sql), atBirth)(sql))
      movedZone(sql, "Pacific/Honolulu")
      const longer = newFeed(
        [segment("left", BIRTH_DATE_BEGINS, BIRTH_DATE_BEGINS + 12 * MINUTE_MS)],
        [bottle(BIRTH_DATE_BEGINS + 15 * MINUTE_MS, 80)],
      )
      const kept = editFeed(stampOf(sql), before.id, edit(before, longer))(sql)
      const later = newFeed([segment("left", BIRTH_DATE_BEGINS + MINUTE_MS, BIRTH_DATE_BEGINS + 12 * MINUTE_MS)])
      return [kept, editFeed(stampOf(sql), before.id, { ...later, version: 2 })(sql)]
    })
    expect(results).toMatchObject([
      { ok: true, response: { version: 2, portions: [{ breastMilkMl: 80 }] } },
      {
        ok: false,
        error: { _tag: "InvalidInput", fieldErrors: [{ path: "segments.0.startedAt", issue: "before_birth" }] },
      },
    ])
  })

  it("refuses sides over another feed's, with SEGMENT_OVERLAP and that feed, changing nothing (D9)", async () => {
    const { before, other, result, after } = await inHousehold((sql) => {
      const other = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(90), minutesAgo(70))]))(sql))
      const before = logged(sql, 60)
      const parts = newFeed([segment("left", minutesAgo(75), minutesAgo(45))])
      const result = editFeed(stampOf(sql), before.id, edit(before, parts))(sql)
      return { before, other, result, after: loadFeed(sql, before.id) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: other }) })
    expect(after).toEqual(before)
  })

  it("refuses a side over the feed running now, with SEGMENT_OVERLAP and that feed (D9)", async () => {
    const { active, result } = await inHousehold((sql) => {
      const before = logged(sql, 60)
      const active = running(sql, minutesAgo(20))
      const parts = newFeed([segment("left", minutesAgo(60), minutesAgo(10))])
      return { active, result: editFeed(stampOf(sql), before.id, edit(before, parts))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: active }) })
  })

  it("answers 404 for a running feed, which the Nursing sheet changes instead, and for a deleted one", async () => {
    const results = await inHousehold((sql) => {
      const active = running(sql, minutesAgo(20))
      const parts = newFeed([segment("left", minutesAgo(25), minutesAgo(5))])
      const runningEdit = editFeed(stampOf(sql), active.id, edit(active, parts))(sql)
      const before = logged(sql, 60)
      const deleted = saved(deleteFeed(stampOf(sql), before.id, versioned(before))(sql))
      return [runningEdit, editFeed(stampOf(sql), before.id, edit(deleted, SWITCHED_EARLIER))(sql)]
    })
    expect(results).toMatchObject([
      { ok: false, error: { _tag: "NotFound" } },
      { ok: false, error: { _tag: "NotFound" } },
    ])
  })

  it("refuses an edit the other parent got in first with STALE_VERSION, showing the feed as it is now", async () => {
    const result = await inHousehold((sql) => {
      const before = logged(sql, 60)
      saved(editFeed(stampOf(sql, EMILY.email), before.id, edit(before, SWITCHED_EARLIER))(sql))
      return editFeed(
        stampOf(sql),
        before.id,
        edit(before, newFeed([segment("left", minutesAgo(60), minutesAgo(30))])),
      )(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { version: 2 } },
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

  it("refuses to restore a feed that starts before the birth date with before_birth on startedAt, and leaves it deleted", async () => {
    const { result, stillDeleted } = await inHousehold((sql) => {
      const entry = newFeed([segment("left", SEP_3_BEGINS, SEP_3_BEGINS + 15 * MINUTE_MS)])
      const feed = saved(logFeed(stampOf(sql), entry)(sql))
      const deleted = saved(deleteFeed(stampOf(sql), feed.id, versioned(feed))(sql))
      movedBirthDate(sql, "2026-09-04")
      const result = restoreFeed(stampOf(sql), feed.id, versioned(deleted))(sql)
      return {
        result,
        stillDeleted: deletedOf(sql, NOW)
          .feeds.map(({ id }) => id)
          .includes(feed.id),
      }
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "InvalidInput", fieldErrors: [{ path: "startedAt", issue: "before_birth" }] },
    })
    expect(stillDeleted).toBe(true)
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

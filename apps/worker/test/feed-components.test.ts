import type { Feed } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { deletePortion, deleteSegment, editPortion, editSegment } from "../src/core/feeds/components.ts"
import { addBottle, startFeed } from "../src/core/feeds/lifecycle.ts"
import { logFeed } from "../src/core/feeds/log.ts"
import type { Stamp } from "../src/core/receipts.ts"
import {
  ACTION_ID,
  bottle,
  CHANGED_TODAY,
  caregiverId,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NOW,
  newFeed,
  saved,
  segment,
  stampOf,
} from "./feed-fixtures.ts"
import { EMILY } from "./fixtures.ts"

const OCT_6_AT_23_40 = Date.UTC(2026, 9, 7, 6, 40)

const twoSides = (sql: SqlStorage) =>
  saved(
    logFeed(
      stampOf(sql),
      newFeed([segment("left", minutesAgo(60), minutesAgo(45)), segment("right", minutesAgo(45), minutesAgo(30))]),
    )(sql),
  )

const withBottle = (sql: SqlStorage) =>
  saved(
    logFeed(
      stampOf(sql),
      newFeed([segment("left", minutesAgo(60), minutesAgo(45))], [bottle(minutesAgo(40), 50)]),
    )(sql),
  )

const bottleOnly = (sql: SqlStorage) => saved(logFeed(stampOf(sql), newFeed([], [bottle(minutesAgo(40), 50)]))(sql))

const segmentIds = (feed: Feed) => feed.segments.map(({ id }) => id)

const portionIds = (feed: Feed) => feed.portions.map(({ id }) => id)

const firstSegment = (feed: Feed) => segmentIds(feed)[0] ?? "missing"

const firstPortion = (feed: Feed) => portionIds(feed)[0] ?? "missing"

const segmentEdit = (feed: Feed, startedAt: number, endedAt: number | null) => ({
  actionId: ACTION_ID,
  version: feed.version,
  side: "right" as const,
  startedAt,
  endedAt,
})

const removal = (feed: Feed, deleteIfEmpty = false) => ({ actionId: ACTION_ID, version: feed.version, deleteIfEmpty })

describe("editing a segment", () => {
  it("changes its side and times, then bumps the feed's version and recomputes its session (D3)", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const before = twoSides(sql)
      const edit = segmentEdit(before, minutesAgo(70), minutesAgo(50))
      const after = saved(editSegment(stampOf(sql, EMILY.email), firstSegment(before), edit)(sql))
      return { before, after, emily: caregiverId(sql, EMILY.email) }
    })
    expect(after).toEqual({
      ...before,
      startedAt: minutesAgo(70),
      segments: [
        { id: firstSegment(before), side: "right", startedAt: minutesAgo(70), endedAt: minutesAgo(50) },
        before.segments[1],
      ],
      version: 2,
      updatedBy: emily,
    })
  })

  it("invalidates both days when a segment moves across midnight (AC 7, AC 18)", async () => {
    const result = await inHousehold((sql) => {
      const lateLeft = segment("left", OCT_6_AT_23_40, OCT_6_AT_23_40 + 15 * MINUTE_MS)
      const feed = saved(logFeed(stampOf(sql), newFeed([lateLeft]))(sql))
      const moved = segmentEdit(feed, OCT_6_AT_23_40 + 30 * MINUTE_MS, OCT_6_AT_23_40 + 45 * MINUTE_MS)
      return editSegment(stampOf(sql), firstSegment(feed), moved)(sql)
    })
    expect(result.ok && result.changed).toEqual([
      ["today"],
      ["last24h"],
      ["day", "2026-10-06"],
      ["day", "2026-10-07"],
      ["week", "2026-W41"],
      ["month", "2026-10"],
    ])
  })

  it("corrects the start of the running segment, which keeps running", async () => {
    const feed = await inHousehold((sql) => {
      const running = saved(
        startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt: minutesAgo(5) })(sql),
      )
      return saved(editSegment(stampOf(sql), firstSegment(running), segmentEdit(running, minutesAgo(12), null))(sql))
    })
    expect(feed).toMatchObject({
      status: "active",
      startedAt: minutesAgo(12),
      endedAt: null,
      segments: [{ side: "right", startedAt: minutesAgo(12), endedAt: null }],
    })
  })

  it.each([
    ["end the running segment", true, minutesAgo(1)],
    ["reopen a closed segment", false, null],
  ])("refuses to %s through an edit, naming endedAt", async (_label, running, endedAt) => {
    const result = await inHousehold((sql) => {
      const feed = running
        ? saved(startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt: minutesAgo(5) })(sql))
        : twoSides(sql)
      return editSegment(stampOf(sql), firstSegment(feed), segmentEdit(feed, minutesAgo(70), endedAt))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "endedAt", issue: "invalid" }] } })
  })

  it("refuses a segment that would last more than 4 hours", async () => {
    const result = await inHousehold((sql) => {
      const feed = twoSides(sql)
      return editSegment(stampOf(sql), firstSegment(feed), segmentEdit(feed, minutesAgo(300), minutesAgo(45)))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "endedAt", issue: "out_of_range" }] } })
  })

  it("refuses an edit that overlaps the feed's other segment, with SEGMENT_OVERLAP and the feed as it was (D9)", async () => {
    const { feed, result } = await inHousehold((sql) => {
      const feed = twoSides(sql)
      const result = editSegment(
        stampOf(sql),
        firstSegment(feed),
        segmentEdit(feed, minutesAgo(60), minutesAgo(40)),
      )(sql)
      return { feed, result }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: feed }) })
  })

  it("refuses an edit from before a bottle was added, since a feed's parts share its version (D3)", async () => {
    const { current, result } = await inHousehold((sql) => {
      const running = saved(
        startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt: minutesAgo(20) })(sql),
      )
      const current = saved(
        addBottle(stampOf(sql, EMILY.email), running.id, {
          actionId: ACTION_ID,
          version: running.version,
          occurredAt: minutesAgo(10),
          breastMilkMl: 30,
          formulaMl: 0,
        })(sql),
      )
      const result = editSegment(stampOf(sql), firstSegment(running), segmentEdit(running, minutesAgo(25), null))(sql)
      return { current, result }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "STALE_VERSION", current }) })
  })

  it("refuses an edit to a segment of a feed the other parent just deleted with STALE_VERSION, showing it deleted", async () => {
    const result = await inHousehold((sql) => {
      const feed = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(60), minutesAgo(45))]))(sql))
      saved(deleteSegment(stampOf(sql, EMILY.email), firstSegment(feed), removal(feed, true))(sql))
      return editSegment(stampOf(sql), firstSegment(feed), segmentEdit(feed, minutesAgo(70), minutesAgo(50)))(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { version: 2, deletedAt: NOW } },
    })
  })

  it("answers NotFound for a deleted segment, even from the feed's current version", async () => {
    const result = await inHousehold((sql) => {
      const feed = twoSides(sql)
      const after = saved(deleteSegment(stampOf(sql), firstSegment(feed), removal(feed))(sql))
      return editSegment(stampOf(sql), firstSegment(feed), segmentEdit(after, minutesAgo(70), minutesAgo(50)))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

describe("deleting a segment", () => {
  it("deletes it softly, recomputing the session and bumping the feed's version", async () => {
    const { feed, result, deletedAt } = await inHousehold((sql) => {
      const feed = twoSides(sql)
      const result = deleteSegment(stampOf(sql), firstSegment(feed), removal(feed))(sql)
      const deletedAt = sql.exec("SELECT deleted_at FROM nursing_segments WHERE id = ?", firstSegment(feed)).one()
      return { feed, result, deletedAt }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...feed, startedAt: minutesAgo(45), segments: feed.segments.slice(1), version: 2 },
      changed: CHANGED_TODAY,
    })
    expect(deletedAt).toEqual({ deleted_at: NOW })
  })

  it("deletes the running segment of a feed with a bottle, leaving the feed paused", async () => {
    const feed = await inHousehold((sql) => {
      const running = saved(
        startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt: minutesAgo(20) })(sql),
      )
      const withBottle = saved(
        addBottle(stampOf(sql), running.id, {
          actionId: ACTION_ID,
          version: 1,
          occurredAt: minutesAgo(15),
          breastMilkMl: 30,
          formulaMl: 0,
        })(sql),
      )
      return saved(deleteSegment(stampOf(sql), firstSegment(withBottle), removal(withBottle))(sql))
    })
    expect(feed).toMatchObject({ status: "active", startedAt: minutesAgo(15), endedAt: minutesAgo(15), segments: [] })
  })

  it("answers FEED_EMPTY with the feed when deleting its last part, and changes nothing", async () => {
    const { feed, result, version } = await inHousehold((sql) => {
      const feed = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(60), minutesAgo(45))]))(sql))
      const result = deleteSegment(stampOf(sql), firstSegment(feed), removal(feed))(sql)
      return { feed, result, version: sql.exec("SELECT version FROM feeds").one() }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "FEED_EMPTY", current: feed }) })
    expect(version).toEqual({ version: 1 })
  })

  it("deletes the feed as it stood when told to, keeping the segment so a restore brings it back", async () => {
    const { feed, result } = await inHousehold((sql) => {
      const feed = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(60), minutesAgo(45))]))(sql))
      return { feed, result: deleteSegment(stampOf(sql), firstSegment(feed), removal(feed, true))(sql) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...feed, version: 2, deletedAt: NOW },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })
})

describe("editing a bottle", () => {
  it("changes its time and amounts (AC 17: 50 to 70 mL)", async () => {
    const { before, after } = await inHousehold((sql) => {
      const before = withBottle(sql)
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: minutesAgo(35), breastMilkMl: 70, formulaMl: 0 }
      return { before, after: saved(editPortion(stampOf(sql), firstPortion(before), edit)(sql)) }
    })
    expect(after).toEqual({
      ...before,
      endedAt: minutesAgo(35),
      portions: [{ id: firstPortion(before), occurredAt: minutesAgo(35), breastMilkMl: 70, formulaMl: 0 }],
      version: 2,
    })
  })

  it("refuses a bottle more than 5 minutes ahead of the server's clock", async () => {
    const result = await inHousehold((sql) => {
      const feed = withBottle(sql)
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: NOW + 6 * MINUTE_MS, breastMilkMl: 70, formulaMl: 0 }
      return editPortion(stampOf(sql), firstPortion(feed), edit)(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "occurredAt", issue: "in_future" }] } })
  })
})

describe("deleting a bottle", () => {
  it("deletes it softly, recomputing the session and bumping the feed's version", async () => {
    const { feed, after } = await inHousehold((sql) => {
      const feed = withBottle(sql)
      return { feed, after: saved(deletePortion(stampOf(sql), firstPortion(feed), removal(feed))(sql)) }
    })
    expect(after).toEqual({ ...feed, endedAt: minutesAgo(45), portions: [], version: 2 })
  })

  it("answers FEED_EMPTY when deleting a bottle-only feed's bottle, and deletes the feed when told to", async () => {
    const { refused, deleted } = await inHousehold((sql) => {
      const feed = bottleOnly(sql)
      const refused = deletePortion(stampOf(sql), firstPortion(feed), removal(feed))(sql)
      const deleted = deletePortion(stampOf(sql), firstPortion(feed), removal(feed, true))(sql)
      return { refused, deleted }
    })
    expect(refused).toMatchObject({ ok: false, error: { code: "FEED_EMPTY" } })
    expect(deleted).toMatchObject({ ok: true, response: { deletedAt: NOW, portions: [{ breastMilkMl: 50 }] } })
  })
})

describe("a segment the other parent deleted", () => {
  it.each([
    [
      "an edit",
      (stamp: Stamp, id: string, feed: Feed) =>
        editSegment(stamp, id, segmentEdit(feed, minutesAgo(70), minutesAgo(50))),
    ],
    ["a delete", (stamp: Stamp, id: string, feed: Feed) => deleteSegment(stamp, id, removal(feed))],
  ])("answers %s from before they deleted it with STALE_VERSION, not NotFound", async (_label, core) => {
    const { before, current, result } = await inHousehold((sql) => {
      const before = twoSides(sql)
      const first = firstSegment(before)
      const current = saved(deleteSegment(stampOf(sql, EMILY.email), first, removal(before))(sql))
      return { before, current, result: core(stampOf(sql), first, before)(sql) }
    })
    expect(current).toMatchObject({ version: 2, segments: before.segments.slice(1) })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "STALE_VERSION", current }) })
  })
})

describe("a segment or bottle that never existed", () => {
  const unknown = "no-such-part"
  const version = { actionId: ACTION_ID, version: 1 }
  it.each([
    [
      "an edit to a segment",
      (stamp: Stamp) => editSegment(stamp, unknown, { ...version, side: "left", startedAt: NOW, endedAt: null }),
    ],
    ["a delete of a segment", (stamp: Stamp) => deleteSegment(stamp, unknown, { ...version, deleteIfEmpty: false })],
    [
      "an edit to a bottle",
      (stamp: Stamp) => editPortion(stamp, unknown, { ...version, occurredAt: NOW, breastMilkMl: 60, formulaMl: 0 }),
    ],
    ["a delete of a bottle", (stamp: Stamp) => deletePortion(stamp, unknown, { ...version, deleteIfEmpty: false })],
  ])("answers NotFound to %s", async (_label, core) => {
    const result = await inHousehold((sql) => {
      withBottle(sql)
      return core(stampOf(sql))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

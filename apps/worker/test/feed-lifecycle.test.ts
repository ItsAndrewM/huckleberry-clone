import type { Feed, Side } from "@bt/contracts"
import { feedSummary } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { addBottle, finishFeed, pauseFeed, resumeFeed, startFeed, switchSide } from "../src/core/feeds/lifecycle.ts"
import { createFeed } from "../src/core/feeds/store.ts"
import {
  ACTION_ID,
  CHANGED_TODAY,
  caregiverId,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NOW,
  rowCount,
  saved,
  segment,
  stampOf,
} from "./feed-fixtures.ts"
import { ANDREW, EMILY } from "./fixtures.ts"

const OCT_6_AT_23_50 = Date.UTC(2026, 9, 7, 6, 50)
const ac4 = (minutes: number) => OCT_6_AT_23_50 + minutes * MINUTE_MS

const at = (feed: Feed, occurredAt: number) => ({ actionId: ACTION_ID, version: feed.version, occurredAt })

const started = (sql: SqlStorage, side: Side = "left", startedAt = minutesAgo(30)) =>
  saved(startFeed(stampOf(sql), { actionId: ACTION_ID, side, startedAt })(sql))

const paused = (sql: SqlStorage) => {
  const feed = started(sql)
  return saved(pauseFeed(stampOf(sql), feed.id, at(feed, minutesAgo(20)))(sql))
}

const finished = (sql: SqlStorage) => {
  const feed = started(sql)
  return saved(finishFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(20)), deleteIfEmpty: false })(sql))
}

describe("a nursing feed from start to finish", () => {
  it("runs left 23:50 to 00:05, right to 00:20, then two bottles: 15 + 15 minutes and 50 + 50 mL (AC 4)", async () => {
    const feed = await inHousehold((sql) => {
      const andrewAt = (minutes: number) => stampOf(sql, ANDREW.email, ac4(minutes))
      const start = { actionId: ACTION_ID, side: "left", startedAt: ac4(0) } as const
      const left = saved(startFeed(andrewAt(0), start)(sql))
      const right = saved(switchSide(andrewAt(15), left.id, at(left, ac4(15)))(sql))
      const pause = saved(pauseFeed(andrewAt(30), right.id, at(right, ac4(30)))(sql))
      const breastMilk = { ...at(pause, ac4(30)), breastMilkMl: 50, formulaMl: 0 }
      const firstBottle = saved(addBottle(andrewAt(30), pause.id, breastMilk)(sql))
      const formula = { ...at(firstBottle, ac4(35)), breastMilkMl: 0, formulaMl: 50 }
      const secondBottle = saved(addBottle(andrewAt(35), firstBottle.id, formula)(sql))
      const finish = { ...at(secondBottle, ac4(35)), deleteIfEmpty: false }
      return saved(finishFeed(andrewAt(35), secondBottle.id, finish)(sql))
    })
    expect(feed).toMatchObject({ status: "completed", startedAt: ac4(0), endedAt: ac4(35), version: 6 })
    expect(feedSummary(feed, ac4(60))).toEqual({
      leftSeconds: 900,
      rightSeconds: 900,
      nursingSeconds: 1800,
      breastMilkMl: 50,
      formulaMl: 50,
      bottleMl: 100,
    })
  })
})

describe("starting a feed", () => {
  it("opens a segment on the chosen side at the tap, as an active feed with no end", async () => {
    const { result, andrew } = await inHousehold((sql) => ({
      result: startFeed(stampOf(sql), { actionId: ACTION_ID, side: "right", startedAt: minutesAgo(1) })(sql),
      andrew: caregiverId(sql, ANDREW.email),
    }))
    expect(result).toEqual({
      ok: true,
      response: {
        id: expect.any(String),
        status: "active",
        startedAt: minutesAgo(1),
        endedAt: null,
        segments: [{ id: expect.any(String), side: "right", startedAt: minutesAgo(1), endedAt: null }],
        portions: [],
        version: 1,
        createdBy: andrew,
        createdAt: NOW,
        updatedBy: andrew,
        updatedAt: NOW,
        deletedAt: null,
      },
      changed: CHANGED_TODAY,
    })
  })

  it.each([
    ["running", started],
    ["paused", paused],
  ])("refuses a second feed while one is %s, with FEED_ALREADY_ACTIVE and that feed", async (_label, existing) => {
    const { active, result, feeds } = await inHousehold((sql) => {
      const active = existing(sql)
      const result = startFeed(stampOf(sql, EMILY.email), { actionId: ACTION_ID, side: "left", startedAt: NOW })(sql)
      return { active, result, feeds: rowCount(sql, "feeds") }
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "FEED_ALREADY_ACTIVE", current: active }),
    })
    expect(feeds).toBe(1)
  })

  it("refuses a start more than 5 minutes ahead of the server's clock", async () => {
    const result = await inHousehold((sql) =>
      startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt: NOW + 6 * MINUTE_MS })(sql),
    )
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "startedAt", issue: "in_future" }] } })
  })

  it("refuses a start inside a saved segment, with SEGMENT_OVERLAP and that feed (D9)", async () => {
    const { logged, result } = await inHousehold((sql) => {
      const logged = createFeed(sql, stampOf(sql), "completed", [segment("left", minutesAgo(20), minutesAgo(5))], [])
      const result = startFeed(stampOf(sql), { actionId: ACTION_ID, side: "right", startedAt: minutesAgo(10) })(sql)
      return { logged, result }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: logged }) })
  })

  it("starts beside an active feed that was deleted", async () => {
    const result = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      saved(finishFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(30)), deleteIfEmpty: true })(sql))
      return startFeed(stampOf(sql), { actionId: ACTION_ID, side: "right", startedAt: minutesAgo(1) })(sql)
    })
    expect(result.ok).toBe(true)
  })
})

describe("switching sides", () => {
  it("closes the running side at the tap and opens the other side there", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const before = started(sql, "left", minutesAgo(30))
      const after = saved(switchSide(stampOf(sql, EMILY.email), before.id, at(before, minutesAgo(15)))(sql))
      return { before, after, emily: caregiverId(sql, EMILY.email) }
    })
    expect(after).toEqual({
      ...before,
      segments: [
        { ...before.segments[0], endedAt: minutesAgo(15) },
        { id: expect.any(String), side: "right", startedAt: minutesAgo(15), endedAt: null },
      ],
      version: 2,
      updatedBy: emily,
    })
  })

  it("lets one of two phones' switches from the same version through, and answers the other STALE_VERSION with the switched feed (AC 13)", async () => {
    const { first, second } = await inHousehold((sql) => {
      const feed = started(sql)
      const first = saved(switchSide(stampOf(sql), feed.id, at(feed, minutesAgo(15)))(sql))
      return { first, second: switchSide(stampOf(sql, EMILY.email), feed.id, at(feed, minutesAgo(14)))(sql) }
    })
    expect(second).toEqual({ ok: false, error: expect.objectContaining({ code: "STALE_VERSION", current: first }) })
    expect(first.segments.filter((one) => one.endedAt === null)).toHaveLength(1)
  })

  it("refuses a switch of a feed the other parent just finished with STALE_VERSION, showing it finished", async () => {
    const result = await inHousehold((sql) => {
      const feed = started(sql)
      saved(finishFeed(stampOf(sql, EMILY.email), feed.id, { ...at(feed, minutesAgo(20)), deleteIfEmpty: false })(sql))
      return switchSide(stampOf(sql), feed.id, at(feed, minutesAgo(15)))(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { _tag: "Conflict", code: "STALE_VERSION", current: { status: "completed", version: 2 } },
    })
  })

  it.each([
    ["paused", paused],
    ["finished", finished],
  ])("answers NotFound for a switch of a %s feed, even from its current version", async (_label, existing) => {
    const result = await inHousehold((sql) => {
      const feed = existing(sql)
      return switchSide(stampOf(sql), feed.id, at(feed, minutesAgo(10)))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it.each([
    ["at the running side's start", minutesAgo(30), "end_not_after_start"],
    ["more than 5 minutes ahead of the server's clock", NOW + 6 * MINUTE_MS, "in_future"],
  ])("refuses a switch %s, naming occurredAt", async (_label, occurredAt, issue) => {
    const result = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      return switchSide(stampOf(sql), feed.id, at(feed, occurredAt))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "occurredAt", issue }] } })
  })

  it("refuses a switch whose new side would run into a saved segment, with SEGMENT_OVERLAP (D9)", async () => {
    const { blocking, result } = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      const ahead = segment("left", NOW + MINUTE_MS, NOW + 3 * MINUTE_MS)
      const blocking = createFeed(sql, stampOf(sql), "completed", [ahead], [])
      return { blocking, result: switchSide(stampOf(sql), feed.id, at(feed, NOW))(sql) }
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: blocking }),
    })
  })
})

describe("pausing", () => {
  it("closes the running side at the tap, keeping the feed active with its session ending there", async () => {
    const feed = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      return saved(pauseFeed(stampOf(sql), feed.id, at(feed, minutesAgo(20)))(sql))
    })
    expect(feed).toMatchObject({
      status: "active",
      endedAt: minutesAgo(20),
      segments: [{ side: "left", startedAt: minutesAgo(30), endedAt: minutesAgo(20) }],
      version: 2,
    })
  })

  it("answers NotFound when pausing a feed that's already paused", async () => {
    const result = await inHousehold((sql) => {
      const feed = paused(sql)
      return pauseFeed(stampOf(sql), feed.id, at(feed, minutesAgo(10)))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it("refuses a pause at the running side's start, which would leave a segment with no length", async () => {
    const result = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      return pauseFeed(stampOf(sql), feed.id, at(feed, minutesAgo(30)))(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { fieldErrors: [{ path: "occurredAt", issue: "end_not_after_start" }] },
    })
  })
})

describe("resuming", () => {
  it("opens a segment on the chosen side at the tap", async () => {
    const feed = await inHousehold((sql) => {
      const feed = paused(sql)
      return saved(resumeFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(10)), side: "right" })(sql))
    })
    expect(feed).toMatchObject({
      status: "active",
      endedAt: null,
      segments: [
        { side: "left", startedAt: minutesAgo(30), endedAt: minutesAgo(20) },
        { side: "right", startedAt: minutesAgo(10), endedAt: null },
      ],
      version: 3,
    })
  })

  it("answers NotFound when resuming a feed that's running", async () => {
    const result = await inHousehold((sql) => {
      const feed = started(sql)
      return resumeFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(10)), side: "right" })(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it("refuses to resume before the pause, with SEGMENT_OVERLAP and the feed itself (D9)", async () => {
    const { feed, result } = await inHousehold((sql) => {
      const feed = paused(sql)
      return { feed, result: resumeFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(25)), side: "right" })(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: feed }) })
  })
})

describe("adding a bottle", () => {
  it.each([
    ["running, without stopping the running side", started, null],
    ["paused, stretching its session to the bottle", paused, minutesAgo(5)],
  ])("adds it to a feed that's %s", async (_label, existing, endedAt) => {
    const feed = await inHousehold((sql) => {
      const feed = existing(sql)
      return saved(
        addBottle(stampOf(sql), feed.id, { ...at(feed, minutesAgo(5)), breastMilkMl: 30, formulaMl: 30 })(sql),
      )
    })
    expect(feed).toMatchObject({
      status: "active",
      endedAt,
      portions: [{ occurredAt: minutesAgo(5), breastMilkMl: 30, formulaMl: 30 }],
    })
  })

  it("answers NotFound for a bottle added to a finished feed", async () => {
    const result = await inHousehold((sql) => {
      const feed = finished(sql)
      return addBottle(stampOf(sql), feed.id, { ...at(feed, minutesAgo(5)), breastMilkMl: 60, formulaMl: 0 })(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it("refuses a bottle more than 5 minutes ahead of the server's clock", async () => {
    const result = await inHousehold((sql) => {
      const feed = started(sql)
      const bottle = { ...at(feed, NOW + 6 * MINUTE_MS), breastMilkMl: 60, formulaMl: 0 }
      return addBottle(stampOf(sql), feed.id, bottle)(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "occurredAt", issue: "in_future" }] } })
  })
})

describe("finishing", () => {
  it("closes the running side at the tap and completes the feed", async () => {
    const feed = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      return saved(finishFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(10)), deleteIfEmpty: false })(sql))
    })
    expect(feed).toMatchObject({
      status: "completed",
      endedAt: minutesAgo(10),
      segments: [{ side: "left", startedAt: minutesAgo(30), endedAt: minutesAgo(10) }],
      version: 2,
    })
  })

  it("completes a paused feed as it stands, whatever time it's sent with", async () => {
    const { before, after } = await inHousehold((sql) => {
      const before = paused(sql)
      const finish = { ...at(before, NOW + 60 * MINUTE_MS), deleteIfEmpty: false }
      return { before, after: saved(finishFeed(stampOf(sql), before.id, finish)(sql)) }
    })
    expect(after).toEqual({ ...before, status: "completed", version: 3 })
  })

  it("drops a running side corrected back to its own start, completing the feed with the rest", async () => {
    const feed = await inHousehold((sql) => {
      const left = started(sql, "left", minutesAgo(30))
      const right = saved(switchSide(stampOf(sql), left.id, at(left, minutesAgo(15)))(sql))
      return saved(finishFeed(stampOf(sql), right.id, { ...at(right, minutesAgo(15)), deleteIfEmpty: false })(sql))
    })
    expect(feed).toMatchObject({
      status: "completed",
      endedAt: minutesAgo(15),
      segments: [{ side: "left", startedAt: minutesAgo(30), endedAt: minutesAgo(15) }],
    })
    expect(feed.segments).toHaveLength(1)
  })

  it("answers FEED_EMPTY with the feed as it is when nothing would be left, and changes nothing", async () => {
    const { feed, result, stored } = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      const result = finishFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(30)), deleteIfEmpty: false })(sql)
      return { feed, result, stored: sql.exec("SELECT status, version, deleted_at FROM feeds").one() }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "FEED_EMPTY", current: feed }) })
    expect(stored).toEqual({ status: "active", version: 1, deleted_at: null })
  })

  it("deletes the feed as it stood when told to, keeping its running side so a restore brings it back", async () => {
    const { feed, result } = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      const finish = { ...at(feed, minutesAgo(30)), deleteIfEmpty: true }
      return { feed, result: finishFeed(stampOf(sql), feed.id, finish)(sql) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...feed, version: 2, deletedAt: NOW },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("refuses a finish before the running side's start", async () => {
    const result = await inHousehold((sql) => {
      const feed = started(sql, "left", minutesAgo(30))
      return finishFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(31)), deleteIfEmpty: false })(sql)
    })
    expect(result).toMatchObject({
      ok: false,
      error: { fieldErrors: [{ path: "occurredAt", issue: "end_not_after_start" }] },
    })
  })

  it("answers NotFound when finishing a finished feed", async () => {
    const result = await inHousehold((sql) => {
      const feed = finished(sql)
      return finishFeed(stampOf(sql), feed.id, { ...at(feed, minutesAgo(5)), deleteIfEmpty: false })(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

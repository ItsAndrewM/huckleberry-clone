import { describe, expect, it } from "vitest"
import { createFeed, saveFeed } from "../src/core/feeds/store.ts"
import { bottle, caregiverId, inHousehold, minutesAgo, NOW, segment, stampOf } from "./feed-fixtures.ts"
import { ANDREW, EMILY } from "./fixtures.ts"

const BEFORE_INSTANTS = Date.UTC(2000, 0, 1) - 1
const AFTER_INSTANTS = Date.UTC(2100, 0, 1)

const insertFeed = (
  sql: SqlStorage,
  status: string,
  startedAt: number,
  endedAt: number | null,
  deletedAt: number | null = null,
) => {
  const andrew = caregiverId(sql, ANDREW.email)
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO feeds (id, status, started_at, ended_at, version, source, created_by, created_at, updated_by, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, 1, 'app', ?, ?, ?, ?, ?)`,
    id,
    status,
    startedAt,
    endedAt,
    andrew,
    NOW,
    andrew,
    NOW,
    deletedAt,
  )
  return id
}

const importFeed = (sql: SqlStorage, source: string, sourceRef: string | null) => {
  const andrew = caregiverId(sql, ANDREW.email)
  sql.exec(
    `INSERT INTO feeds (id, status, started_at, ended_at, version, source, source_ref, created_by, created_at, updated_by, updated_at)
     VALUES (?, 'completed', ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    minutesAgo(30),
    minutesAgo(15),
    source,
    sourceRef,
    andrew,
    NOW,
    andrew,
    NOW,
  )
}

const insertSegment = (
  sql: SqlStorage,
  feedId: string,
  side: string,
  startedAt: number,
  endedAt: number | null,
  sourceRef: string | null = null,
) => {
  const andrew = caregiverId(sql, ANDREW.email)
  sql.exec(
    `INSERT INTO nursing_segments (id, feed_id, side, started_at, ended_at, source, source_ref, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    feedId,
    side,
    startedAt,
    endedAt,
    sourceRef === null ? "app" : "import",
    sourceRef,
    andrew,
    NOW,
    andrew,
    NOW,
  )
}

const insertPortion = (
  sql: SqlStorage,
  feedId: string,
  occurredAt: number,
  breastMilkMl: number,
  formulaMl: number,
  sourceRef: string | null = null,
) => {
  const andrew = caregiverId(sql, ANDREW.email)
  sql.exec(
    `INSERT INTO bottle_portions (id, feed_id, occurred_at, breast_milk_ml, formula_ml, source, source_ref, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    feedId,
    occurredAt,
    breastMilkMl,
    formulaMl,
    sourceRef === null ? "app" : "import",
    sourceRef,
    andrew,
    NOW,
    andrew,
    NOW,
  )
}

describe("the feed store", () => {
  it("creates a feed as version 1 with its session bounds, its segments and bottles in time order", async () => {
    const { feed, andrew } = await inHousehold((sql) => ({
      feed: createFeed(
        sql,
        stampOf(sql),
        "completed",
        [segment("right", minutesAgo(45), minutesAgo(30)), segment("left", minutesAgo(60), minutesAgo(45))],
        [bottle(minutesAgo(25)), bottle(minutesAgo(70), 30, 0)],
      ),
      andrew: caregiverId(sql, ANDREW.email),
    }))
    expect(feed).toEqual({
      id: expect.any(String),
      status: "completed",
      startedAt: minutesAgo(70),
      endedAt: minutesAgo(25),
      segments: [
        { id: expect.any(String), side: "left", startedAt: minutesAgo(60), endedAt: minutesAgo(45) },
        { id: expect.any(String), side: "right", startedAt: minutesAgo(45), endedAt: minutesAgo(30) },
      ],
      portions: [
        { id: expect.any(String), occurredAt: minutesAgo(70), breastMilkMl: 30, formulaMl: 0 },
        { id: expect.any(String), occurredAt: minutesAgo(25), breastMilkMl: 60, formulaMl: 0 },
      ],
      version: 1,
      createdBy: andrew,
      createdAt: NOW,
      updatedBy: andrew,
      updatedAt: NOW,
      deletedAt: null,
    })
  })

  it("saves a feed with new session bounds and version, stamped with who saved it, leaving out deleted parts", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const before = createFeed(
        sql,
        stampOf(sql),
        "active",
        [segment("left", minutesAgo(60), minutesAgo(45)), { side: "right", startedAt: minutesAgo(45), endedAt: null }],
        [],
      )
      sql.exec("UPDATE nursing_segments SET deleted_at = ? WHERE ended_at IS NULL", NOW)
      return {
        before,
        after: saveFeed(sql, stampOf(sql, EMILY.email, NOW + 1), before),
        emily: caregiverId(sql, EMILY.email),
      }
    })
    expect(before).toMatchObject({ startedAt: minutesAgo(60), endedAt: null })
    expect(after).toEqual({
      ...before,
      endedAt: minutesAgo(45),
      segments: before.segments.slice(0, 1),
      version: 2,
      updatedBy: emily,
      updatedAt: NOW + 1,
    })
  })

  it("refuses to create a feed with nothing in it, or to save one left with nothing", async () => {
    await inHousehold((sql) => {
      expect(() => createFeed(sql, stampOf(sql), "completed", [], [])).toThrow(
        "A feed needs a nursing segment or a bottle",
      )
      const feed = createFeed(sql, stampOf(sql), "completed", [segment("left", minutesAgo(30), minutesAgo(15))], [])
      sql.exec("UPDATE nursing_segments SET deleted_at = ?", NOW)
      expect(() => saveFeed(sql, stampOf(sql), feed)).toThrow(
        `Feed ${feed.id} would be left with no nursing segment or bottle`,
      )
    })
  })
})

describe("the feeds tables", () => {
  it("hold at most one live active feed, whatever writes it, beside any number of deleted ones", async () => {
    await inHousehold((sql) => {
      insertFeed(sql, "active", minutesAgo(90), null, minutesAgo(80))
      insertFeed(sql, "active", minutesAgo(70), null, minutesAgo(60))
      insertFeed(sql, "active", minutesAgo(10), null)
      expect(() => insertFeed(sql, "active", minutesAgo(5), null)).toThrow("UNIQUE constraint failed")
    })
  })

  it.each([
    ["a completed feed with no end", "completed", minutesAgo(30), null],
    ["a feed that ends before it starts", "completed", minutesAgo(30), minutesAgo(31)],
    ["a feed that starts before the years an Instant allows", "active", BEFORE_INSTANTS, null],
    ["a feed that ends after them", "completed", minutesAgo(30), AFTER_INSTANTS],
    ["a status that isn't active or completed", "paused", minutesAgo(30), null],
  ])("refuse %s", async (_label, status, startedAt, endedAt) => {
    await inHousehold((sql) => {
      expect(() => insertFeed(sql, status, startedAt, endedAt)).toThrow("CHECK constraint failed")
    })
  })

  it.each([
    ["a segment that doesn't end after it starts", "left", minutesAgo(30), minutesAgo(30)],
    ["a side that isn't left or right", "both", minutesAgo(30), null],
    ["a segment that starts before the years an Instant allows", "left", BEFORE_INSTANTS, null],
  ])("refuse %s", async (_label, side, startedAt, endedAt) => {
    await inHousehold((sql) => {
      const feedId = insertFeed(sql, "active", minutesAgo(30), null)
      expect(() => insertSegment(sql, feedId, side, startedAt, endedAt)).toThrow("CHECK constraint failed")
    })
  })

  it.each([
    ["a bottle with no milk in it", minutesAgo(10), 0, 0],
    ["a negative amount", minutesAgo(10), -10, 70],
    ["a bottle after the years an Instant allows", AFTER_INSTANTS, 60, 0],
  ])("refuse %s", async (_label, occurredAt, breastMilkMl, formulaMl) => {
    await inHousehold((sql) => {
      const feedId = insertFeed(sql, "completed", minutesAgo(10), minutesAgo(10))
      expect(() => insertPortion(sql, feedId, occurredAt, breastMilkMl, formulaMl)).toThrow("CHECK constraint failed")
    })
  })

  it("keep one row per imported source row in each table, and any number from the app (D4)", async () => {
    await inHousehold((sql) => {
      importFeed(sql, "app", null)
      importFeed(sql, "app", null)
      importFeed(sql, "import", "row-7")
      expect(() => importFeed(sql, "import", "row-7")).toThrow("UNIQUE constraint failed")
      const feedId = insertFeed(sql, "completed", minutesAgo(30), minutesAgo(10))
      insertSegment(sql, feedId, "left", minutesAgo(30), minutesAgo(20), "row-8")
      expect(() => insertSegment(sql, feedId, "right", minutesAgo(20), minutesAgo(10), "row-8")).toThrow(
        "UNIQUE constraint failed",
      )
      insertPortion(sql, feedId, minutesAgo(10), 60, 0, "row-9")
      expect(() => insertPortion(sql, feedId, minutesAgo(10), 30, 0, "row-9")).toThrow("UNIQUE constraint failed")
    })
  })

  it.each([
    ["an imported feed without its source row", "import", null],
    ["a feed from the app with a source row", "app", "row-7"],
  ])("refuse %s", async (_label, source, sourceRef) => {
    await inHousehold((sql) => {
      expect(() => importFeed(sql, source, sourceRef)).toThrow("CHECK constraint failed")
    })
  })
})

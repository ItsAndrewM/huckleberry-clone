import { describe, expect, it } from "vitest"
import { logFeed } from "../src/core/feeds/log.ts"
import { createFeed } from "../src/core/feeds/store.ts"
import { bottle, newFeed, rowCount, segment } from "./feed-fixtures.ts"
import {
  ANDREW,
  BIRTH_DATE_BEGINS,
  CHANGED_TODAY,
  caregiverId,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NOW,
  saved,
  stampOf,
} from "./fixtures.ts"

const OCT_6_AT_23_50 = Date.UTC(2026, 9, 7, 6, 50)
const ac4 = (minutes: number) => OCT_6_AT_23_50 + minutes * MINUTE_MS

describe("logging a completed feed", () => {
  it("saves the AC 4 feed across midnight as version 1, with both sides, both bottles, its session and who logged it", async () => {
    const { result, andrew, sources } = await inHousehold((sql) => ({
      result: logFeed(
        stampOf(sql),
        newFeed(
          [segment("left", ac4(0), ac4(15)), segment("right", ac4(15), ac4(30))],
          [bottle(ac4(30), 50, 0), bottle(ac4(35), 0, 50)],
        ),
      )(sql),
      andrew: caregiverId(sql, ANDREW.email),
      sources: sql
        .exec(
          `SELECT source, source_ref FROM feeds UNION ALL SELECT source, source_ref FROM nursing_segments
           UNION ALL SELECT source, source_ref FROM bottle_portions`,
        )
        .toArray(),
    }))
    expect(result).toEqual({
      ok: true,
      response: {
        id: expect.any(String),
        status: "completed",
        startedAt: ac4(0),
        endedAt: ac4(35),
        segments: [
          { id: expect.any(String), side: "left", startedAt: ac4(0), endedAt: ac4(15) },
          { id: expect.any(String), side: "right", startedAt: ac4(15), endedAt: ac4(30) },
        ],
        portions: [
          { id: expect.any(String), occurredAt: ac4(30), breastMilkMl: 50, formulaMl: 0 },
          { id: expect.any(String), occurredAt: ac4(35), breastMilkMl: 0, formulaMl: 50 },
        ],
        version: 1,
        createdBy: andrew,
        createdAt: NOW,
        updatedBy: andrew,
        updatedAt: NOW,
        deletedAt: null,
      },
      changed: [
        ["today"],
        ["last24h"],
        ["day", "2026-10-06"],
        ["day", "2026-10-07"],
        ["week", "2026-W41"],
        ["month", "2026-10"],
      ],
    })
    expect(sources).toEqual(Array(5).fill({ source: "app", source_ref: null }))
  })

  it("saves a bottle on its own as a feed that starts and ends at the bottle (AC 3: 40 + 20 mL)", async () => {
    const result = await inHousehold((sql) => logFeed(stampOf(sql), newFeed([], [bottle(minutesAgo(5), 40, 20)]))(sql))
    expect(result).toMatchObject({
      ok: true,
      response: {
        status: "completed",
        startedAt: minutesAgo(5),
        endedAt: minutesAgo(5),
        segments: [],
        portions: [{ occurredAt: minutesAgo(5), breastMilkMl: 40, formulaMl: 20 }],
      },
      changed: CHANGED_TODAY,
    })
  })

  it.each([
    ["doesn't end after it starts", segment("left", minutesAgo(30), minutesAgo(30)), "endedAt", "end_not_after_start"],
    ["lasts more than 4 hours", segment("left", minutesAgo(241), minutesAgo(0)), "endedAt", "out_of_range"],
    [
      "ends more than 5 minutes after now",
      segment("left", minutesAgo(10), NOW + 6 * MINUTE_MS),
      "endedAt",
      "in_future",
    ],
    [
      "starts before the birth date began",
      segment("left", BIRTH_DATE_BEGINS - MINUTE_MS, BIRTH_DATE_BEGINS + 10 * MINUTE_MS),
      "startedAt",
      "before_birth",
    ],
  ])("refuses a segment that %s, naming the field, and saves nothing", async (_label, bad, field, issue) => {
    const { result, feeds } = await inHousehold((sql) => ({
      result: logFeed(stampOf(sql), newFeed([bad]))(sql),
      feeds: rowCount(sql, "feeds"),
    }))
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ _tag: "InvalidInput", fieldErrors: [{ path: `segments.0.${field}`, issue }] }),
    })
    expect(feeds).toBe(0)
  })

  it("accepts a segment of exactly 4 hours, and one that ends 5 minutes after now", async () => {
    const result = await inHousehold((sql) =>
      logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(235), NOW + 5 * MINUTE_MS)]))(sql),
    )
    expect(result.ok).toBe(true)
  })

  it("names every bad time at once, so the form can mark each field", async () => {
    const result = await inHousehold((sql) =>
      logFeed(
        stampOf(sql),
        newFeed(
          [segment("left", minutesAgo(20), minutesAgo(30)), segment("right", minutesAgo(10), NOW + 10 * MINUTE_MS)],
          [bottle(NOW + 10 * MINUTE_MS)],
        ),
      )(sql),
    )
    expect(result).toMatchObject({
      ok: false,
      error: {
        fieldErrors: [
          { path: "segments.0.endedAt", issue: "end_not_after_start" },
          { path: "segments.1.endedAt", issue: "in_future" },
          { path: "portions.0.occurredAt", issue: "in_future" },
        ],
      },
    })
  })

  it("refuses segments that overlap each other with 400 on segments, and saves nothing", async () => {
    const { result, feeds } = await inHousehold((sql) => ({
      result: logFeed(
        stampOf(sql),
        newFeed([segment("left", minutesAgo(30), minutesAgo(15)), segment("right", minutesAgo(20), minutesAgo(5))]),
      )(sql),
      feeds: rowCount(sql, "feeds"),
    }))
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "segments", issue: "invalid" }] } })
    expect(feeds).toBe(0)
  })

  it("refuses a segment that overlaps a saved one with SEGMENT_OVERLAP and that feed, and saves nothing (D9)", async () => {
    const { first, result, feeds } = await inHousehold((sql) => {
      const first = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(60), minutesAgo(40))]))(sql))
      const result = logFeed(stampOf(sql), newFeed([segment("right", minutesAgo(45), minutesAgo(30))]))(sql)
      return { first, result, feeds: rowCount(sql, "feeds") }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: first }) })
    expect(feeds).toBe(1)
  })

  it("lets a bottle fall inside another feed's segment, since only segments may not overlap", async () => {
    const result = await inHousehold((sql) => {
      saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(60), minutesAgo(40))]))(sql))
      return logFeed(stampOf(sql), newFeed([], [bottle(minutesAgo(50))]))(sql)
    })
    expect(result.ok).toBe(true)
  })

  it("refuses a segment in the 5 minutes after now while a feed runs, since the running side will reach it (AC 21)", async () => {
    const { running, result } = await inHousehold((sql) => {
      const running = createFeed(
        sql,
        stampOf(sql),
        "active",
        [{ side: "left", startedAt: minutesAgo(10), endedAt: null }],
        [],
      )
      const result = logFeed(stampOf(sql), newFeed([segment("right", NOW + MINUTE_MS, NOW + 4 * MINUTE_MS)]))(sql)
      return { running, result }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SEGMENT_OVERLAP", current: running }) })
  })
})

import type { PortionEntry, SegmentEntry } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { deleteDiaper, logDiaper } from "../src/core/diapers.ts"
import { deletePortion, deleteSegment } from "../src/core/feeds/components.ts"
import { deleteFeed } from "../src/core/feeds/feed-edits.ts"
import { pauseFeed, startFeed } from "../src/core/feeds/lifecycle.ts"
import { logFeed } from "../src/core/feeds/log.ts"
import { lastFeed, prefillOf } from "../src/core/feeds/reads.ts"
import { last24hOf, todayOf } from "../src/core/today.ts"
import { bottle, newFeed, segment } from "./feed-fixtures.ts"
import {
  ACTION_ID,
  ANDREW,
  HOUR_MS,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NO_TOTALS,
  NOW,
  SEED,
  saved,
  seededHousehold,
  stampOf,
} from "./fixtures.ts"
import { inStorage } from "./requests.ts"
import { countingRowsRead } from "./rows-read.ts"

const OCT_7_AT_23_50 = Date.UTC(2026, 9, 8, 6, 50)
const ac4 = (minutes: number) => OCT_7_AT_23_50 + minutes * MINUTE_MS

const OCT_25_AT_00_15_BST = Date.UTC(2026, 9, 24, 23, 15)
const OCT_25_AT_23_20_GMT = Date.UTC(2026, 9, 25, 23, 20)
const OCT_25_AT_23_30_GMT = Date.UTC(2026, 9, 25, 23, 30)

const fed = (sql: SqlStorage, segments: SegmentEntry[], portions: PortionEntry[] = []) =>
  saved(logFeed(stampOf(sql), newFeed(segments, portions))(sql))

const diaperAt = (sql: SqlStorage, occurredAt: number, dirty = false) =>
  saved(logDiaper(stampOf(sql), { actionId: ACTION_ID, occurredAt, wet: true, dirty })(sql))

const idAt = (parts: ReadonlyArray<{ readonly id: string }>, index: number) => parts[index]?.id ?? "missing"

describe("todayOf", () => {
  it("answers a household with nothing logged with today's date and nothing else", async () => {
    expect(await inHousehold((sql) => todayOf(sql, NOW))).toEqual({
      date: "2026-10-08",
      totals: NO_TOTALS,
      activeFeed: null,
      lastFeed: null,
      prefill: { lastBottle: null, lastSide: null },
      recent: [],
    })
  })

  it.each([
    ["11:30 pm there, though it's the 9th in UTC", Date.UTC(2026, 9, 9, 6, 30), "2026-10-08"],
    ["midnight there", Date.UTC(2026, 9, 9, 7), "2026-10-09"],
  ])("takes the day in the household's time zone: at %s", async (_label, now, date) => {
    expect((await inHousehold((sql) => todayOf(sql, now))).date).toBe(date)
  })

  it("gives today only the part of a feed after midnight, and counts the feed on the day it started (AC 4)", async () => {
    const today = await inHousehold((sql) => {
      const segments = [segment("left", ac4(0), ac4(15)), segment("right", ac4(15), ac4(30))]
      fed(sql, segments, [bottle(ac4(30), 50, 0), bottle(ac4(35), 0, 50)])
      return todayOf(sql, NOW)
    })
    expect(today.totals).toEqual({
      ...NO_TOTALS,
      leftSeconds: 300,
      rightSeconds: 900,
      nursingSeconds: 1200,
      breastMilkMl: 50,
      formulaMl: 50,
      bottleMl: 100,
    })
  })

  it("counts a running side up to now, and answers its feed as the active and the last feed", async () => {
    const { feed, today, later } = await inHousehold((sql) => {
      const starting = { actionId: ACTION_ID, side: "left" as const, startedAt: minutesAgo(20) }
      const feed = saved(startFeed(stampOf(sql), starting)(sql))
      return { feed, today: todayOf(sql, NOW), later: todayOf(sql, NOW + 10 * MINUTE_MS) }
    })
    expect(today).toEqual({
      date: "2026-10-08",
      totals: { ...NO_TOTALS, feedsStarted: 1, leftSeconds: 1200, nursingSeconds: 1200 },
      activeFeed: feed,
      lastFeed: feed,
      prefill: { lastBottle: null, lastSide: "left" },
      recent: [{ kind: "feed", feed }],
    })
    expect(later.totals.leftSeconds).toBe(1800)
  })

  it("answers a feed paused over a day ago as the active feed, by its status, though it isn't recent", async () => {
    const { paused, today } = await inHousehold((sql) => {
      const starting = { actionId: ACTION_ID, side: "left" as const, startedAt: minutesAgo(26 * 60) }
      const started = saved(startFeed(stampOf(sql), starting)(sql))
      const pausing = { actionId: ACTION_ID, version: started.version, occurredAt: minutesAgo(25 * 60) }
      const paused = saved(pauseFeed(stampOf(sql), started.id, pausing)(sql))
      return { paused, today: todayOf(sql, NOW) }
    })
    expect(today.activeFeed).toEqual(paused)
    expect(today.recent).toEqual([])
  })

  it("takes the last feed by when it started, not when it was logged", async () => {
    const { newest, today } = await inHousehold((sql) => {
      const newest = fed(sql, [], [bottle(minutesAgo(30))])
      fed(sql, [], [bottle(minutesAgo(90))])
      return { newest, today: todayOf(sql, NOW) }
    })
    expect(today.lastFeed).toEqual(newest)
  })

  it("takes the later-logged of two feeds that start at the same minute as the last feed", async () => {
    const { second, today } = await inHousehold((sql) => {
      fed(sql, [], [bottle(minutesAgo(30), 60, 0)])
      const second = fed(sql, [], [bottle(minutesAgo(30), 0, 90)])
      return { second, today: todayOf(sql, NOW) }
    })
    expect(today.lastFeed).toEqual(second)
  })

  it("reads a handful of rows for the last feed and the prefill, however long the history", async () => {
    const reads = await inHousehold((sql) => {
      for (let feed = 0; feed < 150; feed++) {
        const endsAt = minutesAgo(10 + feed * 30)
        fed(
          sql,
          [
            segment("left", endsAt - 20 * MINUTE_MS, endsAt - 10 * MINUTE_MS),
            segment("right", endsAt - 10 * MINUTE_MS, endsAt),
          ],
          [bottle(endsAt)],
        )
      }
      const forLastFeed = countingRowsRead(sql)
      lastFeed(forLastFeed.sql)
      const forPrefill = countingRowsRead(sql)
      prefillOf(forPrefill.sql)
      return { lastFeed: forLastFeed.rowsRead(), prefill: forPrefill.rowsRead() }
    })
    expect(reads.lastFeed).toBeLessThan(20)
    expect(reads.prefill).toBeLessThan(20)
  })

  it("lists every feed and diaper from the last 24 hours, newest first, though yesterday's aren't in today's totals", async () => {
    const { yesterday, diaper, latest, today } = await inHousehold((sql) => {
      diaperAt(sql, minutesAgo(25 * 60))
      const yesterday = fed(sql, [], [bottle(minutesAgo(23 * 60))])
      const diaper = diaperAt(sql, minutesAgo(120))
      const latest = fed(sql, [segment("right", minutesAgo(40), minutesAgo(30))])
      return { yesterday, diaper, latest, today: todayOf(sql, NOW) }
    })
    expect(today.recent).toEqual([
      { kind: "feed", feed: latest },
      { kind: "diaper", diaper },
      { kind: "feed", feed: yesterday },
    ])
    expect(today.totals).toEqual({
      ...NO_TOTALS,
      feedsStarted: 1,
      rightSeconds: 600,
      nursingSeconds: 600,
      diapers: 1,
      wetDiapers: 1,
    })
  })

  it("lists a feed by its start, so one begun over 24 hours ago isn't recent, though it ended since", async () => {
    const { feed, today } = await inHousehold((sql) => {
      const feed = fed(sql, [segment("left", minutesAgo(24 * 60 + 10), minutesAgo(24 * 60 - 5))])
      return { feed, today: todayOf(sql, NOW) }
    })
    expect(today.lastFeed).toEqual(feed)
    expect(today.recent).toEqual([])
  })

  it("leaves a deleted feed out of everything: the totals, the recent list, the last feed and the prefill", async () => {
    const { kept, today } = await inHousehold((sql) => {
      const kept = fed(sql, [segment("left", minutesAgo(180), minutesAgo(165))], [bottle(minutesAgo(160), 40, 20)])
      const dropped = fed(sql, [segment("right", minutesAgo(60), minutesAgo(45))], [bottle(minutesAgo(40), 90, 0)])
      saved(deleteFeed(stampOf(sql), dropped.id, { actionId: ACTION_ID, version: dropped.version })(sql))
      return { kept, today: todayOf(sql, NOW) }
    })
    expect(today).toEqual({
      date: "2026-10-08",
      totals: {
        ...NO_TOTALS,
        feedsStarted: 1,
        leftSeconds: 900,
        nursingSeconds: 900,
        breastMilkMl: 40,
        formulaMl: 20,
        bottleMl: 60,
      },
      activeFeed: null,
      lastFeed: kept,
      prefill: { lastBottle: { breastMilkMl: 40, formulaMl: 20 }, lastSide: "left" },
      recent: [{ kind: "feed", feed: kept }],
    })
  })

  it("leaves out a deleted segment, bottle or diaper, and prefills from the ones before them", async () => {
    const { feed, today } = await inHousehold((sql) => {
      const logged = fed(
        sql,
        [segment("left", minutesAgo(90), minutesAgo(75)), segment("right", minutesAgo(75), minutesAgo(60))],
        [bottle(minutesAgo(55), 30, 0), bottle(minutesAgo(50), 0, 70)],
      )
      const keep = { actionId: ACTION_ID, deleteIfEmpty: false }
      const lessRight = saved(
        deleteSegment(stampOf(sql), idAt(logged.segments, 1), { ...keep, version: logged.version })(sql),
      )
      const feed = saved(
        deletePortion(stampOf(sql), idAt(logged.portions, 1), { ...keep, version: lessRight.version })(sql),
      )
      const diaper = diaperAt(sql, minutesAgo(30))
      saved(deleteDiaper(stampOf(sql), diaper.id, { actionId: ACTION_ID, version: diaper.version })(sql))
      return { feed, today: todayOf(sql, NOW) }
    })
    expect(today.totals).toEqual({
      ...NO_TOTALS,
      feedsStarted: 1,
      leftSeconds: 900,
      nursingSeconds: 900,
      breastMilkMl: 30,
      bottleMl: 30,
    })
    expect(today.prefill).toEqual({ lastBottle: { breastMilkMl: 30, formulaMl: 0 }, lastSide: "left" })
    expect(today.recent).toEqual([{ kind: "feed", feed }])
  })

  it("prefills the latest bottle and the latest side, even when they're in different feeds", async () => {
    const prefill = await inHousehold((sql) => {
      fed(sql, [segment("right", minutesAgo(120), minutesAgo(105))], [bottle(minutesAgo(100), 30, 30)])
      fed(sql, [], [bottle(minutesAgo(30), 0, 90)])
      return todayOf(sql, NOW).prefill
    })
    expect(prefill).toEqual({ lastBottle: { breastMilkMl: 0, formulaMl: 90 }, lastSide: "right" })
  })

  it("prefills the latest bottle and side by their time, not the order they were logged", async () => {
    const prefill = await inHousehold((sql) => {
      fed(sql, [segment("right", minutesAgo(60), minutesAgo(45))], [bottle(minutesAgo(40), 0, 90)])
      fed(sql, [segment("left", minutesAgo(180), minutesAgo(165))], [bottle(minutesAgo(160), 40, 20)])
      return todayOf(sql, NOW).prefill
    })
    expect(prefill).toEqual({ lastBottle: { breastMilkMl: 0, formulaMl: 90 }, lastSide: "right" })
  })

  it("counts and lists a diaper a phone logged ahead of the clock at once (AC 21)", async () => {
    const { diaper, today } = await inHousehold((sql) => {
      const diaper = diaperAt(sql, NOW + 5 * MINUTE_MS)
      return { diaper, today: todayOf(sql, NOW) }
    })
    expect(today.totals).toMatchObject({ diapers: 1, wetDiapers: 1 })
    expect(today.recent).toEqual([{ kind: "diaper", diaper }])
  })

  it("keeps Vancouver on UTC−7 after 1 November 2026, as tz 2026b does, so 00:30 on the 2nd is already the 2nd", async () => {
    expect((await inHousehold((sql) => todayOf(sql, Date.UTC(2026, 10, 2, 7, 30)))).date).toBe("2026-11-02")
  })

  it("totals all 25 hours of a day the clocks go back, from its first hour to its last (AC 23)", async () => {
    const london = await seededHousehold({ ...SEED, timeZone: "Europe/London" })
    const today = await inStorage(london, (sql) => {
      for (const occurredAt of [OCT_25_AT_00_15_BST, OCT_25_AT_23_20_GMT]) {
        const wet = { actionId: ACTION_ID, occurredAt, wet: true, dirty: false }
        saved(logDiaper(stampOf(sql, ANDREW.email, OCT_25_AT_23_30_GMT), wet)(sql))
      }
      return todayOf(sql, OCT_25_AT_23_30_GMT)
    })
    expect(today.date).toBe("2026-10-25")
    expect(today.totals).toEqual({ ...NO_TOTALS, diapers: 2, wetDiapers: 2 })
  })
})

describe("last24hOf", () => {
  it("totals what happened from 24 hours before now, across midnight, and only the part of a feed after then", async () => {
    const last24h = await inHousehold((sql) => {
      fed(sql, [segment("left", minutesAgo(24 * 60 + 10), minutesAgo(24 * 60 - 5))])
      diaperAt(sql, minutesAgo(25 * 60))
      diaperAt(sql, minutesAgo(20 * 60), true)
      fed(sql, [], [bottle(minutesAgo(60), 60, 0)])
      return last24hOf(sql, NOW)
    })
    expect(last24h).toEqual({
      from: NOW - 24 * HOUR_MS,
      totals: {
        ...NO_TOTALS,
        feedsStarted: 1,
        leftSeconds: 300,
        nursingSeconds: 300,
        breastMilkMl: 60,
        bottleMl: 60,
        diapers: 1,
        wetDiapers: 1,
        dirtyDiapers: 1,
      },
    })
  })

  it("counts a time a phone logged ahead of the clock at once (AC 21)", async () => {
    const last24h = await inHousehold((sql) => {
      diaperAt(sql, NOW + 5 * MINUTE_MS)
      return last24hOf(sql, NOW)
    })
    expect(last24h.totals).toMatchObject({ diapers: 1 })
  })
})

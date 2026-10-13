import { describe, expect, it } from "vitest"
import { deletedOf } from "../src/core/deleted.ts"
import { deleteDiaper, logDiaper, restoreDiaper } from "../src/core/diapers.ts"
import { deletePortion } from "../src/core/feeds/components.ts"
import { deleteFeed } from "../src/core/feeds/feed-edits.ts"
import { logFeed } from "../src/core/feeds/log.ts"
import { deleteMeasurement, logMeasurement } from "../src/core/growth.ts"
import { deleteSleep } from "../src/core/sleeps/edits.ts"
import { startSleep } from "../src/core/sleeps/lifecycle.ts"
import { logSleep } from "../src/core/sleeps/log.ts"
import { bottle, newFeed, segment } from "./feed-fixtures.ts"
import {
  ACTION_ID,
  ANDREW,
  caregiverId,
  EMILY,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NOW,
  saved,
  stampOf,
} from "./fixtures.ts"

const DAY_MS = 24 * 60 * MINUTE_MS
const VERSION_1 = { actionId: ACTION_ID, version: 1 }

const diaperAt = (occurredAt: number) => ({ actionId: ACTION_ID, occurredAt, wet: true, dirty: false })

const weighedAt = (measuredAt: number) => ({
  actionId: ACTION_ID,
  measuredAt,
  weightG: 4210.5,
  lengthCm: null,
  headCm: null,
})

const slept = (sql: SqlStorage, startedAt: number, endedAt: number) =>
  saved(logSleep(stampOf(sql), { actionId: crypto.randomUUID(), kind: "nap", startedAt, endedAt })(sql))

const sleeping = (sql: SqlStorage, startedAt: number) =>
  saved(startSleep(stampOf(sql), { actionId: crypto.randomUUID(), kind: "night", startedAt })(sql))

describe("the household's recently deleted entries", () => {
  it("list every deleted feed, diaper and measurement as each was deleted, the newest deletion first", async () => {
    const { first, second, feed, measurement, deleted } = await inHousehold((sql) => {
      const first = saved(logDiaper(stampOf(sql), diaperAt(minutesAgo(90)))(sql))
      const second = saved(logDiaper(stampOf(sql), diaperAt(minutesAgo(60)))(sql))
      const feed = saved(logFeed(stampOf(sql), newFeed([segment("left", minutesAgo(50), minutesAgo(40))]))(sql))
      const measurement = saved(logMeasurement(stampOf(sql), weighedAt(minutesAgo(30)))(sql))
      return {
        first: saved(deleteDiaper(stampOf(sql, ANDREW.email, NOW + 1), first.id, VERSION_1)(sql)),
        measurement: saved(deleteMeasurement(stampOf(sql, ANDREW.email, NOW + 2), measurement.id, VERSION_1)(sql)),
        second: saved(deleteDiaper(stampOf(sql, ANDREW.email, NOW + 3), second.id, VERSION_1)(sql)),
        feed: saved(deleteFeed(stampOf(sql, ANDREW.email, NOW + 4), feed.id, VERSION_1)(sql)),
        deleted: deletedOf(sql, NOW + 5),
      }
    })
    expect(deleted).toEqual({ feeds: [feed], diapers: [second, first], sleeps: [], measurements: [measurement] })
  })

  it("list each deleted sleep as it was deleted, the newest deletion first whatever order they started or were logged in, a running one with no end", async () => {
    const { finished, running, between, deleted } = await inHousehold((sql) => {
      const finishedId = slept(sql, minutesAgo(300), minutesAgo(240)).id
      const runningId = sleeping(sql, minutesAgo(200)).id
      const betweenId = slept(sql, minutesAgo(230), minutesAgo(210)).id
      return {
        running: saved(deleteSleep(stampOf(sql, ANDREW.email, NOW + 1), runningId, VERSION_1)(sql)),
        finished: saved(deleteSleep(stampOf(sql, ANDREW.email, NOW + 2), finishedId, VERSION_1)(sql)),
        between: saved(deleteSleep(stampOf(sql, ANDREW.email, NOW + 3), betweenId, VERSION_1)(sql)),
        deleted: deletedOf(sql, NOW + 4),
      }
    })
    expect(deleted.sleeps).toEqual([between, finished, running])
    expect(deleted.sleeps).toMatchObject([
      { kind: "nap", endedAt: minutesAgo(210) },
      { kind: "nap", endedAt: minutesAgo(240) },
      { kind: "night", endedAt: null },
    ])
  })

  it("leave out a live sleep, finished or running", async () => {
    const deleted = await inHousehold((sql) => {
      slept(sql, minutesAgo(300), minutesAgo(240))
      sleeping(sql, minutesAgo(200))
      return deletedOf(sql, NOW)
    })
    expect(deleted.sleeps).toEqual([])
  })

  it("reach back exactly 30 days for a sleep too, listing one deleted at the edge and not one a millisecond past it", async () => {
    const { atTheEdge, pastIt } = await inHousehold((sql) => {
      const logged = slept(sql, minutesAgo(90), minutesAgo(30))
      saved(deleteSleep(stampOf(sql), logged.id, VERSION_1)(sql))
      return { atTheEdge: deletedOf(sql, NOW + 30 * DAY_MS), pastIt: deletedOf(sql, NOW + 30 * DAY_MS + 1) }
    })
    expect(atTheEdge.sleeps).toHaveLength(1)
    expect(pastIt.sleeps).toEqual([])
  })

  it("name who deleted each entry in its updatedBy, beside who logged it", async () => {
    const { deleted, andrew, emily } = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), diaperAt(minutesAgo(10)))(sql))
      saved(deleteDiaper(stampOf(sql, EMILY.email), logged.id, VERSION_1)(sql))
      return {
        deleted: deletedOf(sql, NOW),
        andrew: caregiverId(sql, ANDREW.email),
        emily: caregiverId(sql, EMILY.email),
      }
    })
    expect(deleted.diapers).toMatchObject([{ createdBy: andrew, updatedBy: emily, deletedAt: NOW }])
  })

  it("leave out live entries, and an entry restored since it was deleted", async () => {
    const deleted = await inHousehold((sql) => {
      saved(logDiaper(stampOf(sql), diaperAt(minutesAgo(20)))(sql))
      const restored = saved(logDiaper(stampOf(sql), diaperAt(minutesAgo(10)))(sql))
      saved(deleteDiaper(stampOf(sql), restored.id, VERSION_1)(sql))
      saved(restoreDiaper(stampOf(sql), restored.id, { actionId: ACTION_ID, version: 2 })(sql))
      return deletedOf(sql, NOW)
    })
    expect(deleted).toEqual({ feeds: [], diapers: [], sleeps: [], measurements: [] })
  })

  it("reach back exactly 30 days from the household's clock", async () => {
    const { atTheEdge, pastIt } = await inHousehold((sql) => {
      const logged = saved(logDiaper(stampOf(sql), diaperAt(minutesAgo(10)))(sql))
      saved(deleteDiaper(stampOf(sql), logged.id, VERSION_1)(sql))
      return { atTheEdge: deletedOf(sql, NOW + 30 * DAY_MS), pastIt: deletedOf(sql, NOW + 30 * DAY_MS + 1) }
    })
    expect(atTheEdge.diapers).toHaveLength(1)
    expect(pastIt.diapers).toEqual([])
  })

  it("list a feed with the parts it had, and not a feed whose bottle alone was deleted", async () => {
    const { whileLive, feed, deleted } = await inHousehold((sql) => {
      const entry = newFeed([segment("left", minutesAgo(50), minutesAgo(40))], [bottle(minutesAgo(45))])
      const logged = saved(logFeed(stampOf(sql), entry)(sql))
      const portionId = logged.portions[0]?.id ?? ""
      const trimming = deletePortion(stampOf(sql), portionId, { ...VERSION_1, deleteIfEmpty: false })
      const trimmed = saved(trimming(sql))
      const whileLive = deletedOf(sql, NOW)
      const feed = saved(deleteFeed(stampOf(sql), logged.id, { actionId: ACTION_ID, version: trimmed.version })(sql))
      return { whileLive, feed, deleted: deletedOf(sql, NOW) }
    })
    expect(whileLive.feeds).toEqual([])
    expect(deleted.feeds).toEqual([feed])
    expect(feed).toMatchObject({ segments: [{ side: "left" }], portions: [] })
  })
})

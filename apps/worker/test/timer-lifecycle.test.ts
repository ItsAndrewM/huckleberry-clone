import type { ConflictCode, FeedConflict, InvalidInput, NotFound, SleepConflict, Totals } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { finishFeed, startFeed } from "../src/core/feeds/lifecycle.ts"
import type { CoreResult, Stamp } from "../src/core/receipts.ts"
import { startSleep, wakeSleep } from "../src/core/sleeps/lifecycle.ts"
import { todayOf } from "../src/core/today.ts"
import { ACTION_ID, ANDREW, EMILY, inHousehold, MINUTE_MS, minutesAgo, NOW, saved, stampOf } from "./fixtures.ts"

interface Timer {
  readonly id: string
  readonly version: number
  readonly startedAt: number
  readonly endedAt: number | null
}

type Failure = InvalidInput | NotFound | FeedConflict | SleepConflict

interface TimerKind {
  readonly alreadyActive: ConflictCode
  readonly start: (sql: SqlStorage, stamp: Stamp, startedAt: number) => CoreResult<Timer, Failure>
  readonly stop: (sql: SqlStorage, stamp: Stamp, timer: Timer, at: number) => CoreResult<Timer, Failure>
  readonly secondsOn: (totals: Totals) => number
}

const NURSING: TimerKind = {
  alreadyActive: "FEED_ALREADY_ACTIVE",
  start: (sql, stamp, startedAt) => startFeed(stamp, { actionId: ACTION_ID, side: "left", startedAt })(sql),
  stop: (sql, stamp, timer, at) =>
    finishFeed(stamp, timer.id, { actionId: ACTION_ID, version: timer.version, occurredAt: at, deleteIfEmpty: false })(
      sql,
    ),
  secondsOn: (totals) => totals.nursingSeconds,
}

const SLEEP: TimerKind = {
  alreadyActive: "SLEEP_ALREADY_ACTIVE",
  start: (sql, stamp, startedAt) => startSleep(stamp, { actionId: ACTION_ID, kind: "night", startedAt })(sql),
  stop: (sql, stamp, timer, at) =>
    wakeSleep(stamp, timer.id, { actionId: ACTION_ID, version: timer.version, occurredAt: at })(sql),
  secondsOn: (totals) => totals.sleepSeconds,
}

const HOUR = 60 * MINUTE_MS
const EDGE = NOW + 5 * MINUTE_MS
const OCT_7_AT_23_30 = Date.UTC(2026, 9, 8, 6, 30)
const OCT_8_AT_01_00 = Date.UTC(2026, 9, 8, 8)

const at = (sql: SqlStorage, now: number) => stampOf(sql, ANDREW.email, now)

describe.each([
  ["a nursing feed", NURSING],
  ["a sleep", SLEEP],
])("the timer lifecycle of %s (AC 20)", (_label, kind) => {
  it("runs from its start with no end, counting up on Today until it's stopped, then holds still", async () => {
    const { running, stopped, whileRunning, later, afterStop } = await inHousehold((sql) => {
      const running = saved(kind.start(sql, at(sql, NOW), minutesAgo(30)))
      const whileRunning = kind.secondsOn(todayOf(sql, NOW).totals)
      const later = kind.secondsOn(todayOf(sql, NOW + 10 * MINUTE_MS).totals)
      const stopped = saved(kind.stop(sql, at(sql, NOW + 10 * MINUTE_MS), running, NOW + 10 * MINUTE_MS))
      return { running, stopped, whileRunning, later, afterStop: kind.secondsOn(todayOf(sql, NOW + HOUR).totals) }
    })
    expect(running).toMatchObject({ startedAt: minutesAgo(30), endedAt: null })
    expect(stopped).toMatchObject({ startedAt: minutesAgo(30), endedAt: NOW + 10 * MINUTE_MS })
    expect([whileRunning, later, afterStop]).toEqual([1800, 2400, 2400])
  })

  it("lets one run at a time, refusing a second with its own code and the one that's running", async () => {
    const { running, second } = await inHousehold((sql) => {
      const running = saved(kind.start(sql, at(sql, NOW), minutesAgo(30)))
      return { running, second: kind.start(sql, stampOf(sql, EMILY.email), NOW) }
    })
    expect(second).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: kind.alreadyActive,
        current: expect.objectContaining({ id: running.id }),
      }),
    })
  })

  it("takes a start exactly 5 minutes ahead of the server's clock, and refuses one a moment later (AC 21)", async () => {
    const { edge, past } = await inHousehold((sql) => ({
      edge: kind.start(sql, at(sql, NOW), EDGE).ok,
      past: kind.start(sql, at(sql, NOW), EDGE + 1),
    }))
    expect(edge).toBe(true)
    expect(past).toMatchObject({ ok: false, error: { _tag: "InvalidInput" } })
  })

  it("takes a stop exactly 5 minutes ahead of the server's clock, and refuses one a moment later (AC 21)", async () => {
    const { edge, past } = await inHousehold((sql) => {
      const running = saved(kind.start(sql, at(sql, NOW), minutesAgo(30)))
      return {
        past: kind.stop(sql, at(sql, NOW), running, EDGE + 1),
        edge: kind.stop(sql, at(sql, NOW), running, EDGE).ok,
      }
    })
    expect(past).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "occurredAt", issue: "in_future" }] } })
    expect(edge).toBe(true)
  })

  it("refuses a stop before its start, naming occurredAt", async () => {
    const result = await inHousehold((sql) => {
      const running = saved(kind.start(sql, at(sql, NOW), minutesAgo(30)))
      return kind.stop(sql, at(sql, NOW), running, minutesAgo(31))
    })
    expect(result).toMatchObject({
      ok: false,
      error: { fieldErrors: [{ path: "occurredAt", issue: "end_not_after_start" }] },
    })
  })

  it("lets one of two phones' stops from the same version through, and answers the other STALE_VERSION (AC 13)", async () => {
    const { first, second } = await inHousehold((sql) => {
      const running = saved(kind.start(sql, at(sql, NOW), minutesAgo(30)))
      const first = saved(kind.stop(sql, at(sql, NOW), running, minutesAgo(5)))
      return { first, second: kind.stop(sql, stampOf(sql, EMILY.email), running, minutesAgo(4)) }
    })
    expect(second).toEqual({ ok: false, error: expect.objectContaining({ code: "STALE_VERSION", current: first }) })
  })

  it("gives each day its own part of a timer that ran from 23:30 to 01:00, and changes both days' keys (AC 4, AC 12)", async () => {
    const { stop, today } = await inHousehold((sql) => {
      const running = saved(kind.start(sql, at(sql, OCT_7_AT_23_30), OCT_7_AT_23_30))
      const stop = kind.stop(sql, at(sql, OCT_8_AT_01_00), running, OCT_8_AT_01_00)
      return { stop, today: todayOf(sql, NOW) }
    })
    expect(stop).toMatchObject({
      ok: true,
      changed: [
        ["today"],
        ["last24h"],
        ["day", "2026-10-07"],
        ["day", "2026-10-08"],
        ["week", "2026-W41"],
        ["month", "2026-10"],
      ],
    })
    expect(kind.secondsOn(today.totals)).toBe(3600)
  })
})

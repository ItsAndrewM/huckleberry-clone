import type { Sleep, SleepKind } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { startSleep, wakeSleep } from "../src/core/sleeps/lifecycle.ts"
import { createSleep, saveSleep } from "../src/core/sleeps/store.ts"
import { rowCount } from "./feed-fixtures.ts"
import {
  ACTION_ID,
  BIRTH_DATE_BEGINS,
  CHANGED_TODAY,
  caregiverId,
  EMILY,
  HOUR_MS,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NOW,
  saved,
  stampOf,
} from "./fixtures.ts"

const OCT_6_AT_23_30 = Date.UTC(2026, 9, 7, 6, 30)
const OCT_7_AT_01_00 = Date.UTC(2026, 9, 7, 8)
const CHANGED_OCT_6_AND_7 = [
  ["today"],
  ["last24h"],
  ["day", "2026-10-06"],
  ["day", "2026-10-07"],
  ["week", "2026-W41"],
  ["month", "2026-10"],
]

const start = (startedAt: number, kind: SleepKind = "nap") => ({ actionId: ACTION_ID, kind, startedAt })

const at = (sleep: Sleep, occurredAt: number) => ({ actionId: ACTION_ID, version: sleep.version, occurredAt })

const started = (sql: SqlStorage, startedAt = minutesAgo(30)) => saved(startSleep(stampOf(sql), start(startedAt))(sql))

const logged = (sql: SqlStorage, startedAt: number, endedAt: number) =>
  createSleep(sql, stampOf(sql), { kind: "nap", startedAt, endedAt })

describe("starting a sleep", () => {
  it("opens a sleep of the chosen kind at the tap, running with no end", async () => {
    const { result, andrew } = await inHousehold((sql) => ({
      result: startSleep(stampOf(sql), start(minutesAgo(1), "night"))(sql),
      andrew: caregiverId(sql, "andrew@example.test"),
    }))
    expect(result).toEqual({
      ok: true,
      response: {
        id: expect.any(String),
        kind: "night",
        startedAt: minutesAgo(1),
        endedAt: null,
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

  it("refuses a second sleep while one is running, with SLEEP_ALREADY_ACTIVE and that sleep, writing nothing", async () => {
    const { running, result, sleeps } = await inHousehold((sql) => {
      const running = started(sql)
      const result = startSleep(stampOf(sql, EMILY.email), start(NOW))(sql)
      return { running, result, sleeps: rowCount(sql, "sleeps") }
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "SLEEP_ALREADY_ACTIVE", current: running }),
    })
    expect(sleeps).toBe(1)
  })

  it.each([
    ["more than 5 minutes ahead of the server's clock", NOW + 6 * MINUTE_MS, "in_future"],
    ["before her birth date", BIRTH_DATE_BEGINS - MINUTE_MS, "before_birth"],
  ])("refuses a start %s, naming startedAt", async (_label, startedAt, issue) => {
    const result = await inHousehold((sql) => startSleep(stampOf(sql), start(startedAt))(sql))
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "startedAt", issue }] } })
  })

  it("refuses a start inside a saved sleep, with SLEEP_OVERLAP and that sleep", async () => {
    const { earlier, result } = await inHousehold((sql) => {
      const earlier = logged(sql, minutesAgo(60), minutesAgo(10))
      return { earlier, result: startSleep(stampOf(sql), start(minutesAgo(30)))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SLEEP_OVERLAP", current: earlier }) })
  })

  it("refuses a start before a saved sleep that's still to come, since a running sleep reaches 5 minutes past now", async () => {
    const { ahead, result } = await inHousehold((sql) => {
      const ahead = logged(sql, NOW + MINUTE_MS, NOW + 3 * MINUTE_MS)
      return { ahead, result: startSleep(stampOf(sql), start(minutesAgo(5)))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SLEEP_OVERLAP", current: ahead }) })
  })

  it("starts the moment a saved sleep ended, since a sleep is half-open", async () => {
    const result = await inHousehold((sql) => {
      logged(sql, minutesAgo(60), minutesAgo(10))
      return startSleep(stampOf(sql), start(minutesAgo(10)))(sql)
    })
    expect(result.ok).toBe(true)
  })

  it("starts beside a running sleep that was deleted", async () => {
    const result = await inHousehold((sql) => {
      const running = started(sql)
      saveSleep(sql, stampOf(sql), { ...running, deletedAt: NOW })
      return startSleep(stampOf(sql), start(minutesAgo(1)))(sql)
    })
    expect(result.ok).toBe(true)
  })
})

describe("waking", () => {
  it("ends the running sleep at the tap, as its next version, stamped with who woke it", async () => {
    const { before, after, emily } = await inHousehold((sql) => {
      const before = started(sql)
      const after = saved(wakeSleep(stampOf(sql, EMILY.email), before.id, at(before, minutesAgo(5)))(sql))
      return { before, after, emily: caregiverId(sql, EMILY.email) }
    })
    expect(after).toEqual({ ...before, endedAt: minutesAgo(5), version: 2, updatedBy: emily })
  })

  it("lets one of two phones' wakes from the same version through, and answers the other STALE_VERSION with the woken sleep", async () => {
    const { first, second } = await inHousehold((sql) => {
      const sleep = started(sql)
      const first = saved(wakeSleep(stampOf(sql), sleep.id, at(sleep, minutesAgo(5)))(sql))
      return { first, second: wakeSleep(stampOf(sql, EMILY.email), sleep.id, at(sleep, minutesAgo(4)))(sql) }
    })
    expect(second).toEqual({ ok: false, error: expect.objectContaining({ code: "STALE_VERSION", current: first }) })
  })

  it.each([
    ["a sleep that has ended", (sql: SqlStorage) => logged(sql, minutesAgo(60), minutesAgo(30))],
    ["a deleted sleep", (sql: SqlStorage) => saveSleep(sql, stampOf(sql), { ...started(sql), deletedAt: NOW })],
  ])("answers NotFound for a wake of %s, even from its current version", async (_label, existing) => {
    const result = await inHousehold((sql) => {
      const sleep = existing(sql)
      return wakeSleep(stampOf(sql), sleep.id, at(sleep, minutesAgo(1)))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it("answers NotFound for a sleep it doesn't hold", async () => {
    const result = await inHousehold((sql) =>
      wakeSleep(stampOf(sql), "no-such-sleep", { actionId: ACTION_ID, version: 1, occurredAt: NOW })(sql),
    )
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it.each([
    ["at its start", minutesAgo(30), "end_not_after_start"],
    ["before its start", minutesAgo(31), "end_not_after_start"],
    ["more than 5 minutes ahead of the server's clock", NOW + 6 * MINUTE_MS, "in_future"],
  ])("refuses a wake %s, naming occurredAt", async (_label, occurredAt, issue) => {
    const result = await inHousehold((sql) => {
      const sleep = started(sql, minutesAgo(30))
      return wakeSleep(stampOf(sql), sleep.id, at(sleep, occurredAt))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "occurredAt", issue }] } })
  })

  it("wakes a sleep left running for more than a day, since only a typed sleep is held to a day", async () => {
    const result = await inHousehold((sql) => {
      const sleep = started(sql, NOW - 30 * HOUR_MS)
      return wakeSleep(stampOf(sql), sleep.id, at(sleep, NOW))(sql)
    })
    expect(result).toMatchObject({ ok: true, response: { startedAt: NOW - 30 * HOUR_MS, endedAt: NOW } })
  })

  it("changes both days of a sleep woken after midnight, and their week and month (AC 12)", async () => {
    const result = await inHousehold((sql) => {
      const sleep = saved(startSleep(stampOf(sql, undefined, OCT_6_AT_23_30), start(OCT_6_AT_23_30, "night"))(sql))
      return wakeSleep(stampOf(sql, undefined, OCT_7_AT_01_00), sleep.id, at(sleep, OCT_7_AT_01_00))(sql)
    })
    expect(result).toMatchObject({ ok: true, changed: CHANGED_OCT_6_AND_7 })
  })
})

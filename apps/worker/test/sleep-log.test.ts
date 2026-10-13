import type { NewSleep, SleepKind } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { startSleep } from "../src/core/sleeps/lifecycle.ts"
import { logSleep } from "../src/core/sleeps/log.ts"
import { rowCount } from "./feed-fixtures.ts"
import {
  ACTION_ID,
  BIRTH_DATE_BEGINS,
  CHANGED_TODAY,
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

const past = (startedAt: number, endedAt: number, kind: SleepKind = "nap"): NewSleep => ({
  actionId: ACTION_ID,
  kind,
  startedAt,
  endedAt,
})

const logged = (sql: SqlStorage, startedAt: number, endedAt: number) =>
  saved(logSleep(stampOf(sql), past(startedAt, endedAt))(sql))

describe("logging a past sleep", () => {
  it("saves its kind and both its times as version 1, changing today's keys", async () => {
    const result = await inHousehold((sql) =>
      logSleep(stampOf(sql), past(minutesAgo(90), minutesAgo(30), "night"))(sql),
    )
    expect(result).toMatchObject({
      ok: true,
      response: { kind: "night", startedAt: minutesAgo(90), endedAt: minutesAgo(30), version: 1, deletedAt: null },
      changed: CHANGED_TODAY,
    })
  })

  it("changes both days of the 23:30 to 01:00 sleep, and their week and month (AC 12)", async () => {
    const result = await inHousehold((sql) =>
      logSleep(stampOf(sql), past(OCT_6_AT_23_30, OCT_7_AT_01_00, "night"))(sql),
    )
    expect(result).toMatchObject({
      ok: true,
      changed: [
        ["today"],
        ["last24h"],
        ["day", "2026-10-06"],
        ["day", "2026-10-07"],
        ["week", "2026-W41"],
        ["month", "2026-10"],
      ],
    })
  })

  it.each([
    ["an end at its start", past(minutesAgo(30), minutesAgo(30)), "endedAt", "end_not_after_start"],
    ["an end before its start", past(minutesAgo(30), minutesAgo(40)), "endedAt", "end_not_after_start"],
    ["an end more than 5 minutes ahead", past(minutesAgo(30), NOW + 6 * MINUTE_MS), "endedAt", "in_future"],
    ["a sleep longer than a day", past(NOW - 24 * HOUR_MS - MINUTE_MS, NOW), "endedAt", "out_of_range"],
    [
      "a start before her birth date",
      past(BIRTH_DATE_BEGINS - HOUR_MS, BIRTH_DATE_BEGINS),
      "startedAt",
      "before_birth",
    ],
  ])("refuses %s, naming the field and writing nothing", async (_label, entry, path, issue) => {
    const { result, sleeps } = await inHousehold((sql) => ({
      result: logSleep(stampOf(sql), entry)(sql),
      sleeps: rowCount(sql, "sleeps"),
    }))
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path, issue }] } })
    expect(sleeps).toBe(0)
  })

  it("names both fields when both are wrong", async () => {
    const entry = past(NOW + 6 * MINUTE_MS, NOW + 7 * MINUTE_MS)
    const result = await inHousehold((sql) => logSleep(stampOf(sql), entry)(sql))
    expect(result).toMatchObject({
      ok: false,
      error: {
        fieldErrors: [
          { path: "startedAt", issue: "in_future" },
          { path: "endedAt", issue: "in_future" },
        ],
      },
    })
  })

  it("takes a sleep of exactly a day", async () => {
    const result = await inHousehold((sql) => logSleep(stampOf(sql), past(NOW - 24 * HOUR_MS, NOW))(sql))
    expect(result.ok).toBe(true)
  })

  it("refuses a sleep that overlaps a saved one, with SLEEP_OVERLAP and that sleep", async () => {
    const { earlier, result } = await inHousehold((sql) => {
      const earlier = logged(sql, minutesAgo(120), minutesAgo(60))
      return { earlier, result: logSleep(stampOf(sql), past(minutesAgo(70), minutesAgo(30)))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SLEEP_OVERLAP", current: earlier }) })
  })

  it("refuses a sleep that runs into the running one, which reaches 5 minutes past now", async () => {
    const { running, result } = await inHousehold((sql) => {
      const running = saved(startSleep(stampOf(sql), { actionId: ACTION_ID, kind: "nap", startedAt: NOW })(sql))
      return { running, result: logSleep(stampOf(sql), past(NOW + MINUTE_MS, NOW + 2 * MINUTE_MS))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SLEEP_OVERLAP", current: running }) })
  })

  it.each([
    ["ends as the saved one starts", past(minutesAgo(90), minutesAgo(60))],
    ["starts as the saved one ends", past(minutesAgo(30), minutesAgo(10))],
  ])("takes a sleep that %s, since a sleep is half-open", async (_label, entry) => {
    const result = await inHousehold((sql) => {
      logged(sql, minutesAgo(60), minutesAgo(30))
      return logSleep(stampOf(sql), entry)(sql)
    })
    expect(result.ok).toBe(true)
  })
})

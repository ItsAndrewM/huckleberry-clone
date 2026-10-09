import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { calendarOf, changedKeys, timeIssue } from "../src/core/calendar.ts"
import { BIRTH_DATE_BEGINS, MINUTE_MS, NOW, OCT_1_AT_00_30, SEP_30_AT_23_30, seededHousehold } from "./fixtures.ts"

const CALENDAR = { zone: "America/Vancouver", birthDate: "2026-09-01" }

describe("the household's calendar", () => {
  it("is the household's time zone and the child's birth date, read in one query", async () => {
    const household = await seededHousehold()
    const calendar = await runInDurableObject(household, (_instance, state) => calendarOf(state.storage.sql))
    expect(calendar).toEqual(CALENDAR)
  })
})

describe("timeIssue", () => {
  it.each([
    ["5 minutes ahead of the server's clock, for a phone whose clock runs fast", NOW + 5 * MINUTE_MS, null],
    ["more than 5 minutes ahead of the server's clock", NOW + 5 * MINUTE_MS + 1, "in_future"],
    ["the first moment of the birth date in the household's time zone", BIRTH_DATE_BEGINS, null],
    ["before the birth date began in the household's time zone", BIRTH_DATE_BEGINS - 1, "before_birth"],
  ])("judges a time %s", (_label, at, issue) => {
    expect(timeIssue(CALENDAR, at, NOW)).toBe(issue)
  })
})

describe("changedKeys", () => {
  it("names today, last24h, and every day, week and month either interval touches", () => {
    const before = { start: SEP_30_AT_23_30, end: SEP_30_AT_23_30 }
    const after = { start: OCT_1_AT_00_30, end: OCT_1_AT_00_30 }
    expect(changedKeys(CALENDAR, before, after)).toEqual([
      ["today"],
      ["last24h"],
      ["day", "2026-09-30"],
      ["day", "2026-10-01"],
      ["week", "2026-W40"],
      ["month", "2026-09"],
      ["month", "2026-10"],
    ])
  })

  it("names only today and last24h when neither side has a time", () => {
    expect(changedKeys(CALENDAR, null, null)).toEqual([["today"], ["last24h"]])
  })
})

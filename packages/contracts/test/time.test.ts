import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Instant, IsoWeek, LocalDate, TimeZone, YearMonth } from "../src/index.ts"

const fromJson = <S extends Schema.Codec<string | number, string | number>>(schema: S) => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(schema))
  return (input: string | number | null) => Exit.isSuccess(decode(input))
}

describe("Instant", () => {
  const decodes = fromJson(Instant)

  it.each([
    ["the first instant of 2000", Date.UTC(2000, 0, 1)],
    ["the last millisecond of 2099", Date.UTC(2100, 0, 1) - 1],
    ["a time on 6 October 2026", Date.UTC(2026, 9, 6, 12, 30)],
  ])("accepts %s", (_, instant) => {
    expect(decodes(instant)).toBe(true)
  })

  it.each([
    ["NaN sent as the string Effect's number codec reads", "NaN"],
    ["Infinity sent as a string", "Infinity"],
    ["-Infinity sent as a string", "-Infinity"],
    ["a number too big for a double", JSON.parse("1e400")],
    ["a fraction of a millisecond", Date.UTC(2026, 9, 6) + 0.5],
    ["seconds instead of milliseconds", Date.UTC(2026, 9, 6) / 1000],
    ["microseconds instead of milliseconds", Date.UTC(2026, 9, 6) * 1000],
    ["the last millisecond of 1999", Date.UTC(2000, 0, 1) - 1],
    ["the first instant of 2100", Date.UTC(2100, 0, 1)],
    ["a numeric string", String(Date.UTC(2026, 9, 6))],
    ["null", null],
  ])("rejects %s", (_, input) => {
    expect(decodes(input)).toBe(false)
  })
})

describe("LocalDate, IsoWeek and YearMonth", () => {
  it.each(["2026-10-06", "2028-02-29", "1999-01-01", "2100-12-31"])("LocalDate accepts %j", (date) => {
    expect(fromJson(LocalDate)(date)).toBe(true)
  })

  it.each(["2026-02-30", "2026-10-6", "1998-12-31", "2101-01-01", "+002026-10-06", "", "2026-10-06T00:00"])(
    "LocalDate rejects %j",
    (date) => {
      expect(fromJson(LocalDate)(date)).toBe(false)
    },
  )

  it.each(["2026-W41", "2026-W53", "1999-W01", "2099-W53", "2100-W52"])("IsoWeek accepts %j", (week) => {
    expect(fromJson(IsoWeek)(week)).toBe(true)
  })

  it.each(["2026-W54", "2025-W53", "1998-W53", "2101-W01", "2026-41", "2026-W5"])("IsoWeek rejects %j", (week) => {
    expect(fromJson(IsoWeek)(week)).toBe(false)
  })

  it.each(["2026-10", "1999-01", "2100-12"])("YearMonth accepts %j", (month) => {
    expect(fromJson(YearMonth)(month)).toBe(true)
  })

  it.each(["2026-13", "2026-1", "1998-12", "2101-01", "2026-10-06"])("YearMonth rejects %j", (month) => {
    expect(fromJson(YearMonth)(month)).toBe(false)
  })
})

describe("TimeZone", () => {
  it.each(["America/Vancouver", "Europe/London", "Australia/Lord_Howe", "US/Pacific", "UTC"])("accepts %j", (name) => {
    expect(fromJson(TimeZone)(name)).toBe(true)
  })

  it.each(["-07:00", "+05:30", "Mars/Olympus_Mons", "", "constructor"])("rejects %j", (name) => {
    expect(fromJson(TimeZone)(name)).toBe(false)
  })
})

describe("the JSON Schema that docs/api.json shows for calendar strings", () => {
  it.each([
    ["LocalDate", LocalDate, { type: "string", format: "date" }],
    ["IsoWeek", IsoWeek, { type: "string", pattern: "^\\d{4}-W\\d{2}$" }],
    ["YearMonth", YearMonth, { type: "string", pattern: "^\\d{4}-\\d{2}$" }],
  ])("describes %s's format", (_name, schema, jsonSchema) => {
    expect(Schema.toJsonSchemaDocument(schema).schema).toEqual(jsonSchema)
  })
})

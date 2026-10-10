import { Exit, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  type Child,
  ChildConflict,
  ChildEdit,
  type Household,
  HouseholdConflict,
  HouseholdEdit,
  invalidInputFrom,
} from "../src/index.ts"

const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
const AT = Date.UTC(2026, 9, 8, 14, 30)
const UNITS = { volume: "fl_oz", weight: "lb_oz", length: "in" } as const

const HOUSEHOLD: Household = {
  name: "Test household",
  timeZone: "America/Vancouver",
  units: UNITS,
  version: 1,
  updatedBy: null,
  updatedAt: AT,
}

const CHILD: Child = {
  name: "Robin",
  birthDate: "2026-09-01",
  sex: "female",
  gestationalAgeDays: 281,
  version: 3,
  updatedBy: "caregiver-1",
  updatedAt: AT,
}

const fieldErrors = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) => {
  const decoded = Schema.decodeUnknownResult(Schema.toCodecJson(schema), { errors: "all" })(input)
  return Result.isFailure(decoded) ? invalidInputFrom(decoded.failure.issue).fieldErrors : []
}

describe("an edit to the household", () => {
  const edit = { actionId: ACTION_ID, version: 1, timeZone: "America/Vancouver", units: UNITS }

  it("carries the time zone, every unit and the version it was made from", () => {
    expect(fieldErrors(HouseholdEdit, edit)).toEqual([])
    expect(fieldErrors(HouseholdEdit, { actionId: ACTION_ID })).toEqual([
      { path: "version", issue: "invalid" },
      { path: "timeZone", issue: "invalid" },
      { path: "units", issue: "invalid" },
    ])
  })

  it("takes a time zone by any name the tz data knows, such as an old alias", () => {
    expect(fieldErrors(HouseholdEdit, { ...edit, timeZone: "US/Pacific" })).toEqual([])
  })

  it.each(["Mars/Olympus_Mons", "+05:00", ""])("refuses %j as a time zone", (timeZone) => {
    expect(fieldErrors(HouseholdEdit, { ...edit, timeZone })).toEqual([{ path: "timeZone", issue: "invalid" }])
  })

  it("names each unit that isn't one of its choices", () => {
    expect(fieldErrors(HouseholdEdit, { ...edit, units: { volume: "oz", weight: "lb", length: "mm" } })).toEqual([
      { path: "units.volume", issue: "invalid" },
      { path: "units.weight", issue: "invalid" },
      { path: "units.length", issue: "invalid" },
    ])
  })
})

describe("an edit to the child", () => {
  const edit = {
    actionId: ACTION_ID,
    version: 3,
    name: "Robin",
    birthDate: "2026-09-01",
    sex: "male",
    gestationalAgeDays: 154,
  }

  it("carries every field and the version it was made from", () => {
    expect(fieldErrors(ChildEdit, edit)).toEqual([])
    expect(fieldErrors(ChildEdit, { actionId: ACTION_ID, version: 3 })).toEqual([
      { path: "name", issue: "invalid" },
      { path: "birthDate", issue: "invalid" },
      { path: "sex", issue: "invalid" },
      { path: "gestationalAgeDays", issue: "invalid" },
    ])
  })

  it.each(["", " Robin", "Robin ", "R".repeat(61)])("refuses the name %j", (name) => {
    expect(fieldErrors(ChildEdit, { ...edit, name })).toEqual([{ path: "name", issue: "invalid" }])
  })

  it.each([
    ["a date that doesn't exist", { birthDate: "2026-02-30" }],
    ["a sex the WHO tables don't have", { sex: "unknown" }],
    ["a gestational age under 22 weeks", { gestationalAgeDays: 153 }],
    ["a gestational age over 44 weeks and 6 days", { gestationalAgeDays: 315 }],
    ["a gestational age that isn't whole days", { gestationalAgeDays: 280.5 }],
  ])("refuses %s", (_label, change) => {
    expect(fieldErrors(ChildEdit, { ...edit, ...change })).toEqual([{ path: Object.keys(change)[0], issue: "invalid" }])
  })
})

describe("a household or child conflict", () => {
  it.each([
    ["HouseholdConflict", HouseholdConflict, HOUSEHOLD],
    ["ChildConflict", ChildConflict, CHILD],
  ] as const)(
    "%s carries STALE_VERSION or ACTION_REPLAY_MISMATCH with the record as it is now",
    (_label, conflict, current) => {
      const decode = Schema.decodeUnknownExit(Schema.toCodecJson(conflict))
      for (const code of ["STALE_VERSION", "ACTION_REPLAY_MISMATCH"]) {
        const exit = decode({ _tag: "Conflict", code, current })
        expect(Exit.isSuccess(exit) && exit.value.current).toEqual(current)
      }
      expect(Exit.isFailure(decode({ _tag: "Conflict", code: "FEED_ALREADY_ACTIVE", current }))).toBe(true)
    },
  )
})

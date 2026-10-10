import { HouseholdConflict, InvalidInput, ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"
import { childFieldsOf, weeksAndDays } from "../src/features/settings/child-fields.ts"
import { fieldMessage, saveFailure } from "../src/features/settings/messages.ts"
import { timeZoneGroups } from "../src/features/settings/time-zones.ts"
import { unitChange } from "../src/features/settings/units.ts"

const HOUSEHOLD = {
  name: "Home",
  timeZone: "America/Vancouver",
  units: { volume: "ml", weight: "kg", length: "cm" },
  version: 3,
  updatedBy: "caregiver-2",
  updatedAt: Date.UTC(2026, 9, 8),
} as const

describe("timeZoneGroups", () => {
  it("groups the phone's zones by region, each sorted by place, with the household's zone kept even if unknown", () => {
    const zones = ["Europe/London", "America/Vancouver", "America/Argentina/Buenos_Aires", "UTC"]
    expect(timeZoneGroups(zones, "Asia/Calcutta")).toEqual([
      {
        region: "America",
        zones: [
          { value: "America/Argentina/Buenos_Aires", label: "Argentina / Buenos Aires" },
          { value: "America/Vancouver", label: "Vancouver" },
        ],
      },
      { region: "Asia", zones: [{ value: "Asia/Calcutta", label: "Calcutta" }] },
      { region: "Europe", zones: [{ value: "Europe/London", label: "London" }] },
      { region: "Other", zones: [{ value: "UTC", label: "UTC" }] },
    ])
  })
})

describe("unitChange", () => {
  it("names the one unit a tap changes, and nothing for a value that isn't one of its choices", () => {
    expect(unitChange("volume", "fl_oz")).toEqual({ volume: "fl_oz" })
    expect(unitChange("weight", "lb_oz")).toEqual({ weight: "lb_oz" })
    expect(unitChange("length", "in")).toEqual({ length: "in" })
    expect(unitChange("volume", "lb_oz")).toBeUndefined()
  })
})

describe("saveFailure", () => {
  it.each([
    [new Offline(), "Not saved: there's no connection. Try again once you're back online."],
    [new AuthRequired(), "Not saved. Sign in, then try again."],
    [new Unauthorized(), "Not saved. Sign in, then try again."],
    [
      new HouseholdConflict({ code: "STALE_VERSION", current: HOUSEHOLD }),
      "This changed on another phone a moment ago. Check it and try again.",
    ],
    [new ServiceUnavailable(), "Not saved. Try again."],
    [new Unexpected({ status: 500 }), "Not saved. Try again."],
  ])("says why %o wasn't saved", (error, message) => {
    expect(saveFailure(error)).toBe(message)
  })

  it("says nothing before a save, or for a refusal its fields explain", () => {
    expect(saveFailure(null)).toBeUndefined()
    expect(saveFailure(new InvalidInput({ fieldErrors: [{ path: "name", issue: "invalid" }] }))).toBeUndefined()
  })
})

describe("the child form", () => {
  const formOf = (entries: Record<string, string>) => {
    const form = new FormData()
    for (const [name, value] of Object.entries(entries)) form.set(name, value)
    return form
  }

  it("shows a gestational age as whole weeks and days", () => {
    expect(weeksAndDays(281)).toEqual({ weeks: 40, days: 1 })
  })

  it("reads its fields, trimming the name and counting the age at birth in days", () => {
    const form = formOf({ name: "  Robin Rae ", birthDate: "2026-09-01", sex: "male", weeks: "39", days: "6" })
    expect(childFieldsOf(form)).toEqual({
      name: "Robin Rae",
      birthDate: "2026-09-01",
      sex: "male",
      gestationalAgeDays: 279,
    })
  })

  it.each(["7", "11", "-1", "2.5"])("refuses %s days rather than rolling them into the weeks", (days) => {
    const form = formOf({ name: "Robin", birthDate: "2026-09-01", sex: "female", weeks: "39", days })
    expect(childFieldsOf(form).gestationalAgeDays).toBeNaN()
  })
})

describe("fieldMessage", () => {
  it("explains each field the household refused, and nothing for one it took", () => {
    const refused = new InvalidInput({
      fieldErrors: [
        { path: "birthDate", issue: "before_birth" },
        { path: "name", issue: "invalid" },
      ],
    })
    expect(fieldMessage(refused, "birthDate")).toBe(
      "Some entries are from before this date. Move or delete them first.",
    )
    expect(fieldMessage(refused, "name")).toBe("Enter a name of up to 60 characters.")
    expect(fieldMessage(refused, "sex")).toBeUndefined()
    expect(fieldMessage(new Offline(), "name")).toBeUndefined()
  })
})

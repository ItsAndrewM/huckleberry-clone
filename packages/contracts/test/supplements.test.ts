import { Exit, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  Dose,
  DoseConflict,
  DoseEdit,
  DosesGroup,
  invalidInputFrom,
  MAX_DOSE_LENGTH,
  NewDose,
  NewSupplement,
  SavedDose,
  SavedSupplement,
  Supplement,
  SupplementConflict,
  SupplementEdit,
  SupplementsGroup,
} from "../src/index.ts"

const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
const AT = Date.UTC(2026, 9, 8, 14, 30)

const VITAMIN_D: Supplement = {
  id: "supplement-1",
  name: "Vitamin D",
  dose: "400 IU",
  stoppedAt: null,
  version: 1,
  createdBy: null,
  createdAt: AT,
  updatedBy: null,
  updatedAt: AT,
}

const DOSE: Dose = {
  id: "dose-1",
  supplementId: "supplement-1",
  occurredAt: AT,
  localDate: "2026-10-08",
  dose: "400 IU",
  version: 1,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-1",
  updatedAt: AT,
  deletedAt: null,
}

const fieldErrors = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) => {
  const decoded = Schema.decodeUnknownResult(Schema.toCodecJson(schema), { errors: "all" })(input)
  return Result.isFailure(decoded) ? invalidInputFrom(decoded.failure.issue).fieldErrors : []
}

const endpointsOf = (group: { readonly endpoints: Record<string, { method: string; path: string }> }) =>
  Object.entries(group.endpoints).map(([name, { method, path }]) => `${name} ${method} ${path}`)

describe("a supplement", () => {
  it("is a name and a dose, given until it's stopped, with no author when the household seeded it", () => {
    expect(fieldErrors(Supplement, VITAMIN_D)).toEqual([])
    expect(fieldErrors(Supplement, { ...VITAMIN_D, stoppedAt: AT, createdBy: "caregiver-1" })).toEqual([])
  })

  it("may have no dose written down", () => {
    expect(fieldErrors(Supplement, { ...VITAMIN_D, dose: "" })).toEqual([])
  })

  it("is answered with the keys its save changed", () => {
    expect(fieldErrors(SavedSupplement, { supplement: VITAMIN_D, changed: [["me"]] })).toEqual([])
  })
})

describe("a new supplement", () => {
  it("carries a name and a dose", () => {
    expect(fieldErrors(NewSupplement, { actionId: ACTION_ID, name: "Iron", dose: "1 mL" })).toEqual([])
  })

  it(`refuses an empty or padded name, and a dose longer than ${MAX_DOSE_LENGTH} characters`, () => {
    expect(fieldErrors(NewSupplement, { actionId: ACTION_ID, name: "", dose: "x".repeat(41) })).toEqual([
      { path: "name", issue: "invalid" },
      { path: "dose", issue: "invalid" },
    ])
    expect(fieldErrors(NewSupplement, { actionId: ACTION_ID, name: " Iron", dose: "1 mL " })).toEqual([
      { path: "name", issue: "invalid" },
      { path: "dose", issue: "invalid" },
    ])
  })
})

describe("an edit to a supplement", () => {
  it("carries its name, its dose, whether it's stopped, and the version it was made from", () => {
    const edit = { actionId: ACTION_ID, version: 2, name: "Vitamin D3", dose: "800 IU", stopped: true }
    expect(fieldErrors(SupplementEdit, edit)).toEqual([])
    expect(fieldErrors(SupplementEdit, { ...edit, version: 0, stopped: "yes" })).toEqual([
      { path: "version", issue: "invalid" },
      { path: "stopped", issue: "invalid" },
    ])
  })
})

describe("SupplementConflict", () => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(SupplementConflict))

  it.each(["STALE_VERSION", "ACTION_REPLAY_MISMATCH"])("carries %s with the supplement it's about", (code) => {
    const exit = decode({ _tag: "Conflict", code, current: VITAMIN_D })
    expect(Exit.isSuccess(exit) && exit.value.current).toEqual(VITAMIN_D)
  })

  it("refuses a code a supplement can't conflict on", () => {
    expect(Exit.isFailure(decode({ _tag: "Conflict", code: "SUPPLEMENT_DUPLICATE_DAY", current: VITAMIN_D }))).toBe(
      true,
    )
  })
})

describe("a dose", () => {
  it("is a supplement given at a time, on the household's date then, with the dose as it was written", () => {
    expect(fieldErrors(Dose, DOSE)).toEqual([])
    expect(fieldErrors(Dose, { ...DOSE, localDate: "2026-10-32" })).toEqual([{ path: "localDate", issue: "invalid" }])
  })

  it("is answered with the keys its save changed", () => {
    expect(fieldErrors(SavedDose, { dose: DOSE, changed: [["today"], ["day", "2026-10-08"]] })).toEqual([])
  })
})

describe("a new dose", () => {
  it("names its supplement and its time, and whether a second dose that day was meant", () => {
    const dose = { actionId: ACTION_ID, supplementId: "supplement-1", occurredAt: AT, confirmedDuplicate: false }
    expect(fieldErrors(NewDose, dose)).toEqual([])
    expect(fieldErrors(NewDose, { ...dose, confirmedDuplicate: true })).toEqual([])
  })

  it("names every field that's missing or bad", () => {
    expect(fieldErrors(NewDose, { actionId: "first", occurredAt: AT / 1000 })).toEqual([
      { path: "actionId", issue: "invalid" },
      { path: "supplementId", issue: "invalid" },
      { path: "occurredAt", issue: "invalid" },
      { path: "confirmedDuplicate", issue: "invalid" },
    ])
  })
})

describe("an edit to a dose", () => {
  it("moves its time, from the version it was made from", () => {
    expect(fieldErrors(DoseEdit, { actionId: ACTION_ID, version: 2, occurredAt: AT })).toEqual([])
    expect(fieldErrors(DoseEdit, { actionId: ACTION_ID, occurredAt: AT })).toEqual([
      { path: "version", issue: "invalid" },
    ])
  })
})

describe("DoseConflict", () => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(DoseConflict))

  it.each(["SUPPLEMENT_DUPLICATE_DAY", "STALE_VERSION", "ACTION_REPLAY_MISMATCH"])(
    "carries %s with the dose it's about",
    (code) => {
      const exit = decode({ _tag: "Conflict", code, current: DOSE })
      expect(Exit.isSuccess(exit) && exit.value.current).toEqual(DOSE)
    },
  )

  it("refuses a code a dose can't conflict on", () => {
    expect(Exit.isFailure(decode({ _tag: "Conflict", code: "FEED_EMPTY", current: DOSE }))).toBe(true)
  })
})

describe("the supplement endpoints", () => {
  it("add a supplement and edit one, stopping it included", () => {
    expect(endpointsOf(SupplementsGroup)).toEqual([
      "addSupplement POST /supplements",
      "editSupplement PATCH /supplements/:id",
    ])
  })

  it("log, edit, delete and restore a dose", () => {
    expect(endpointsOf(DosesGroup)).toEqual([
      "logDose POST /doses",
      "editDose PATCH /doses/:id",
      "deleteDose DELETE /doses/:id",
      "restoreDose POST /doses/:id/restore",
    ])
  })
})

import { DiaperConflict, FeedConflict, NotFound } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { diaperDelete, diaperEdit, diaperEditSession, occurredAtOf } from "../src/features/edit/diaper-edit.ts"
import { sentAnyway, staleMessage, staleOf } from "../src/features/edit/stale.ts"
import type { Display } from "../src/features/today/display.ts"
import { failureNote, type Household } from "../src/sheets/failure.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { NOW as NOW_WHEN, whenAt } from "../src/sheets/when.ts"
import { ANDREW, diaperAt, EMILY, feedAt, NOW, ZONE } from "./today-fixtures.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TWO_TEN = Date.UTC(2026, 9, 9, 9, 10)
const TWO_ELEVEN = Date.UTC(2026, 9, 9, 9, 11)
const TWO_TEN_AND_A_BIT = TWO_TEN + 37_412
const PEE = diaperAt(TWO_TEN, { id: "diaper-1", version: 2 })
const PEE_TO_THE_SECOND = diaperAt(TWO_TEN_AND_A_BIT, { id: "diaper-1", version: 2 })
const CAREGIVERS = [
  { id: ANDREW, displayName: "Andrew" },
  { id: EMILY, displayName: "Emily" },
]
const DISPLAY: Display = { timeZone: ZONE, volume: "ml", locale: "en-US", caregivers: CAREGIVERS, supplements: [] }
const HOUSEHOLD: Household = { caregivers: CAREGIVERS, timeZone: ZONE, childName: "Robin", locale: "en-US" }

const EDITED: Sending = {
  sheet: "editDiaper",
  action: {
    kind: "editDiaper",
    id: "diaper-1",
    payload: { actionId: "action-edit", version: 2, occurredAt: TWO_TEN - 60_000, wet: true, dirty: true },
  },
}

const EDITED_TO_THE_SECOND: Sending = {
  sheet: "editDiaper",
  action: {
    kind: "editDiaper",
    id: "diaper-1",
    payload: { actionId: "action-edit", version: 2, occurredAt: TWO_TEN_AND_A_BIT, wet: true, dirty: true },
  },
}

const spaced = (text: string) => text.replace(/\s/gu, " ")

describe("editing a diaper", () => {
  it("starts from the diaper as it is, under a fresh actionId", () => {
    const session = diaperEditSession(null, PEE, ZONE)
    expect(session).toEqual({
      actionId: expect.stringMatching(UUID),
      target: { id: "diaper-1", version: 2 },
      occurredAt: TWO_TEN,
      when: whenAt(TWO_TEN, ZONE),
      kind: { wet: true, dirty: false },
    })
    expect(diaperEdit(session, { wet: false, dirty: true }, TWO_TEN)).toEqual({
      kind: "editDiaper",
      id: "diaper-1",
      payload: { actionId: session.actionId, version: 2, occurredAt: TWO_TEN, wet: false, dirty: true },
    })
  })

  it("reopens on the values a failed save sent, under its actionId, so a retry can't save it twice", () => {
    const failed: Failed = { sending: EDITED, error: new Offline() }
    expect(diaperEditSession(failed, PEE, ZONE)).toEqual({
      actionId: "action-edit",
      target: { id: "diaper-1", version: 2 },
      occurredAt: TWO_TEN - 60_000,
      when: whenAt(TWO_TEN - 60_000, ZONE),
      kind: { wet: true, dirty: true },
    })
  })

  it("deletes at the version it opened on, under its own actionId", () => {
    expect(diaperDelete({ id: "diaper-1", version: 2 })).toEqual({
      kind: "deleteDiaper",
      id: "diaper-1",
      payload: { actionId: expect.stringMatching(UUID), version: 2 },
    })
  })

  it("says the diaper was deleted when the household no longer has it", () => {
    expect(failureNote(new NotFound(), HOUSEHOLD, { keptOn: null, sheet: "editDiaper" }).message).toBe(
      "This was deleted since it opened.",
    )
  })
})

describe("a diaper's time", () => {
  const session = diaperEditSession(null, PEE_TO_THE_SECOND, ZONE)

  it("keeps the exact time, seconds included, while its When is left alone", () => {
    expect(occurredAtOf(session, session.when, ZONE, NOW)).toEqual({ ok: true, instant: TWO_TEN_AND_A_BIT })
  })

  it("reads a changed When as the minute picked, on the household's clock", () => {
    const picked = { kind: "at", local: "2026-10-09T02:11", pick: null } as const
    expect(occurredAtOf(session, picked, ZONE, NOW)).toEqual({ ok: true, instant: TWO_ELEVEN })
  })

  it("takes the moment tapped once the When is set back to Now", () => {
    expect(occurredAtOf(session, NOW_WHEN, ZONE, NOW)).toEqual({ ok: true, instant: NOW })
  })

  it("keeps the exact time a failed edit sent, so its retry sends the same time again", () => {
    const failed: Failed = { sending: EDITED_TO_THE_SECOND, error: new Offline() }
    const resumed = diaperEditSession(failed, PEE, ZONE)
    expect(occurredAtOf(resumed, resumed.when, ZONE, NOW)).toEqual({ ok: true, instant: TWO_TEN_AND_A_BIT })
  })
})

describe("a save the other phone got to first", () => {
  const theirs = { ...PEE, version: 3, dirty: true, updatedBy: EMILY }
  const stale: Failed = { sending: EDITED, error: new DiaperConflict({ code: "STALE_VERSION", current: theirs }) }

  it("says who changed it and how it reads now", () => {
    const found = staleOf(stale)
    expect(found).toEqual({ current: { kind: "diaper", diaper: theirs }, deleting: false })
    expect(found === null ? "" : spaced(staleMessage(DISPLAY, found, NOW))).toBe(
      "Emily changed this a moment ago. It now reads: Diaper at 2:10 AM: Both, pee and poo.",
    )
  })

  it("sends the same save again on top of their version", () => {
    expect(sentAnyway(EDITED, { kind: "diaper", diaper: theirs })).toEqual({
      ...EDITED,
      action: { ...EDITED.action, payload: { ...EDITED.action.payload, version: 3 } },
    })
  })

  it("asks to delete anyway after their change, and says when they deleted it", () => {
    const deleting: Sending = { sheet: "editDiaper", action: diaperDelete({ id: "diaper-1", version: 2 }) }
    const asked = staleOf({ sending: deleting, error: new DiaperConflict({ code: "STALE_VERSION", current: theirs }) })
    expect(asked === null ? "" : spaced(staleMessage(DISPLAY, asked, NOW))).toMatch(/ Delete it anyway\?$/u)
    const gone = { kind: "diaper" as const, diaper: { ...theirs, deletedAt: NOW } }
    expect(staleMessage(DISPLAY, { current: gone, deleting: false }, NOW)).toBe("Emily deleted this a moment ago.")
  })

  it("leaves every other failure to the sheet's usual note", () => {
    expect(staleOf({ sending: EDITED, error: new Offline() })).toBeNull()
    const overlap = new FeedConflict({ code: "SEGMENT_OVERLAP", current: feedAt(NOW) })
    expect(staleOf({ sending: EDITED, error: overlap })).toBeNull()
  })
})

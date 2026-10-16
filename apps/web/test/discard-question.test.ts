import { describe, expect, it } from "vitest"
import { discardQuestion } from "../src/sheets/discard-question.ts"
import type { Household } from "../src/sheets/failure.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { ANDREW, EMILY, NOW, ZONE } from "./today-fixtures.ts"

const HOUSEHOLD: Household = {
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  timeZone: ZONE,
  childName: "Robin",
  locale: "en-US",
}

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const TAPPED = NOW + 37_000

const WOKE: Sending = {
  sheet: "sleep",
  action: { kind: "wakeSleep", id: "sleep-1", payload: { actionId: ACTION_ID, version: 1, occurredAt: TAPPED } },
}

const asked = (sending: Sending, household: Household | null = HOUSEHOLD) =>
  discardQuestion(sending, household).replace(/\s/gu, " ")

describe("discardQuestion", () => {
  it.each<[string, Sending]>([
    ["Discard the wake-up at 9:30 AM?", WOKE],
    [
      "Discard the pause at 9:30 AM?",
      {
        sheet: "nursing",
        action: { kind: "pauseFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED } },
      },
    ],
    [
      "Discard the switch at 9:30 AM?",
      {
        sheet: "nursing",
        action: { kind: "switchSide", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED } },
      },
    ],
    [
      "Discard resuming on Right at 9:30 AM?",
      {
        sheet: "nursing",
        action: {
          kind: "resumeFeed",
          id: "feed-1",
          payload: { actionId: ACTION_ID, version: 3, side: "right", occurredAt: TAPPED },
        },
      },
    ],
    [
      "Discard the finish at 9:30 AM?",
      {
        sheet: "nursing",
        action: {
          kind: "finishFeed",
          id: "feed-1",
          payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED, deleteIfEmpty: false },
        },
      },
    ],
  ])("names a failed control by the time it was tapped: %s", (question, sending) => {
    expect(asked(sending)).toBe(question)
  })

  it.each<[string, Sending]>([
    [
      "Discard your changes?",
      {
        sheet: "editDose",
        action: { kind: "editDose", id: "dose-1", payload: { actionId: ACTION_ID, version: 1, occurredAt: TAPPED } },
      },
    ],
    [
      "Discard your changes?",
      {
        sheet: "sleep",
        action: {
          kind: "editSleep",
          id: "sleep-1",
          payload: { actionId: ACTION_ID, version: 1, kind: "night", startedAt: NOW - 3_600_000, endedAt: null },
        },
      },
    ],
    [
      "Discard the delete?",
      { sheet: "sleep", action: { kind: "deleteSleep", id: "sleep-1", payload: { actionId: ACTION_ID, version: 2 } } },
    ],
    [
      "Discard the restore?",
      {
        sheet: "diaper",
        action: { kind: "restoreDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 2 } },
      },
    ],
    [
      "Discard this entry?",
      {
        sheet: "diaper",
        action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: TAPPED, wet: true, dirty: false } },
      },
    ],
  ])("says what an edit, a delete, a restore or an entry would lose: %s", (question, sending) => {
    expect(asked(sending)).toBe(question)
  })

  it("leaves the time out while the household hasn't loaded", () => {
    expect(asked(WOKE, null)).toBe("Discard the wake-up?")
  })
})

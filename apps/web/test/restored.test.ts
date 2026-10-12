import { describe, expect, it } from "vitest"
import { DRAFT_RETRY_MS, renewed, StaleDraft } from "../src/sheets/drafts.ts"
import { type KeptEntry, Unsaved } from "../src/sheets/kept.ts"
import { restored } from "../src/sheets/restored.ts"
import { BOTTLE, DIAPER } from "./held-fixtures.ts"
import { NOW } from "./today-fixtures.ts"

const HOUR = 3_600_000
const RENEWED = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"
const newId = () => RENEWED

const failedDiaper: KeptEntry = { sending: DIAPER, keptAt: NOW - HOUR, failed: true }
const sendingBottle: KeptEntry = { sending: BOTTLE, keptAt: NOW - HOUR, failed: false }

describe("entries back from a reload", () => {
  it("asks about each one, keeping the actionId of one kept under 12 hours", () => {
    expect(restored(null, [failedDiaper, sendingBottle], NOW, newId)).toEqual({
      held: [
        { sending: DIAPER, error: new Unsaved({ keptAt: NOW - HOUR, failed: true }) },
        { sending: BOTTLE, error: new Unsaved({ keptAt: NOW - HOUR, failed: false }) },
      ],
      kept: [failedDiaper, sendingBottle],
    })
  })

  it("gives an entry kept 12 hours or more a new actionId, and keeps it under that one", () => {
    const old = { ...failedDiaper, keptAt: NOW - DRAFT_RETRY_MS }
    const sending = renewed(DIAPER, RENEWED)
    expect(restored(null, [old], NOW, newId)).toEqual({
      held: [{ sending, error: new Unsaved({ keptAt: old.keptAt, failed: true }) }],
      kept: [{ ...old, sending }],
    })
  })

  it("leaves a fresh sign-in draft to be sent again as it was, keeping its entry until the household confirms it", () => {
    const draft = { route: "/", sending: DIAPER, createdAt: NOW - HOUR }
    expect(restored(draft, [failedDiaper, sendingBottle], NOW, newId)).toEqual({
      held: [{ sending: BOTTLE, error: new Unsaved({ keptAt: NOW - HOUR, failed: false }) }],
      kept: [sendingBottle, failedDiaper],
    })
  })

  it("asks first about a draft past the retry window, under a new actionId, in place of its old copy", () => {
    const draft = { route: "/", sending: DIAPER, createdAt: NOW - DRAFT_RETRY_MS }
    const sending = renewed(DIAPER, RENEWED)
    expect(restored(draft, [{ ...failedDiaper, keptAt: draft.createdAt }, sendingBottle], NOW, newId)).toEqual({
      held: [
        { sending, error: new StaleDraft({ createdAt: draft.createdAt }) },
        { sending: BOTTLE, error: new Unsaved({ keptAt: NOW - HOUR, failed: false }) },
      ],
      kept: [{ sending, keptAt: draft.createdAt, failed: true }, sendingBottle],
    })
  })
})

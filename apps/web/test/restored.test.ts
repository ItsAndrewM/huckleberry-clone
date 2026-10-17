import { describe, expect, it } from "vitest"
import { DRAFT_RETRY_MS, renewed, StaleDraft } from "../src/sheets/drafts.ts"
import { type KeptEntry, Unsaved } from "../src/sheets/kept.ts"
import { restored } from "../src/sheets/restored.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { BOTTLE, DIAPER } from "./held-fixtures.ts"
import { NOW } from "./today-fixtures.ts"

const HOUR = 3_600_000
const RENEWED = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"
const newId = () => RENEWED

const failedDiaper: KeptEntry = { sending: DIAPER, keptAt: NOW - HOUR, idSince: NOW - HOUR, failed: true }
const sendingBottle: KeptEntry = { sending: BOTTLE, keptAt: NOW - HOUR, idSince: NOW - HOUR, failed: false }
const stored = (...entries: ReadonlyArray<KeptEntry>) => ({ entries, unreadable: [] })
const unsaved = ({ keptAt, failed }: KeptEntry) => new Unsaved({ keptAt, failed })

const PAUSE: Sending = {
  sheet: "nursing",
  action: { kind: "pauseFeed", id: "feed-1", payload: { actionId: "action-pause", version: 2, occurredAt: NOW } },
}

const EDITED_SLEEP: Sending = {
  sheet: "editSleep",
  action: {
    kind: "editSleep",
    id: "sleep-1",
    payload: { actionId: "action-edit", version: 2, kind: "nap", startedAt: NOW - HOUR, endedAt: NOW },
  },
}

describe("entries back from a reload", () => {
  it("asks about each one, keeping the actionId of one kept under 12 hours", () => {
    expect(restored(null, stored(failedDiaper, sendingBottle), NOW, newId)).toEqual({
      held: [
        { sending: DIAPER, error: unsaved(failedDiaper) },
        { sending: BOTTLE, error: unsaved(sendingBottle) },
      ],
      kept: [failedDiaper, sendingBottle],
      unreadable: [],
      resend: null,
    })
  })

  it("gives an entry whose actionId is 12 hours old a new one, whose 12 hours start now, so the next reload keeps it", () => {
    const old = { ...failedDiaper, idSince: NOW - DRAFT_RETRY_MS }
    const sending = renewed(DIAPER, RENEWED)
    const back = restored(null, stored(old), NOW, newId)
    expect(back.held).toEqual([{ sending, error: unsaved(old) }])
    expect(back.kept).toEqual([{ ...old, sending, idSince: NOW }])
    const later = restored(null, stored(...back.kept), NOW + HOUR, () => "6f1d2c3b-4a5e-4b6c-8d7e-9f0a1b2c3d4e")
    expect(later.held.map((held) => held.sending)).toEqual([sending])
  })

  it("leaves a fresh sign-in draft to be sent again as it was, keeping its entry until the household confirms it", () => {
    const draft = { route: "/", sending: DIAPER, createdAt: NOW - HOUR }
    expect(restored(draft, stored(failedDiaper, sendingBottle), NOW, newId)).toEqual({
      held: [{ sending: BOTTLE, error: unsaved(sendingBottle) }],
      kept: [sendingBottle, failedDiaper],
      unreadable: [],
      resend: DIAPER,
    })
  })

  it("asks about a fresh draft whose actionId has been kept 12 hours or more, under a new one", () => {
    const draft = { route: "/", sending: DIAPER, createdAt: NOW - HOUR }
    const old = { ...failedDiaper, keptAt: NOW - DRAFT_RETRY_MS, idSince: NOW - DRAFT_RETRY_MS }
    const sending = renewed(DIAPER, RENEWED)
    expect(restored(draft, stored(old), NOW, newId)).toEqual({
      held: [{ sending, error: new StaleDraft({ createdAt: draft.createdAt }) }],
      kept: [{ sending, keptAt: old.keptAt, idSince: NOW, failed: true }],
      unreadable: [],
      resend: null,
    })
  })

  it("asks first about a draft past the retry window, under a new actionId, in place of its old copy", () => {
    const draft = { route: "/", sending: DIAPER, createdAt: NOW - DRAFT_RETRY_MS }
    const sending = renewed(DIAPER, RENEWED)
    const copy = { ...failedDiaper, keptAt: draft.createdAt, idSince: draft.createdAt }
    expect(restored(draft, stored(copy, sendingBottle), NOW, newId)).toEqual({
      held: [
        { sending, error: new StaleDraft({ createdAt: draft.createdAt }) },
        { sending: BOTTLE, error: unsaved(sendingBottle) },
      ],
      kept: [{ sending, keptAt: draft.createdAt, idSince: NOW, failed: true }, sendingBottle],
      unreadable: [],
      resend: null,
    })
  })

  it("asks about a stale draft of a control, keeping one from Nursing or Sleep but not one from an Edit sheet", () => {
    const draft = { route: "/", sending: PAUSE, createdAt: NOW - DRAFT_RETRY_MS }
    const sending = renewed(PAUSE, RENEWED)
    const back = restored(draft, stored(), NOW, newId)
    expect(back.held).toEqual([{ sending, error: new StaleDraft({ createdAt: draft.createdAt }) }])
    expect(back.kept).toEqual([{ sending, keptAt: draft.createdAt, idSince: NOW, failed: true }])
    expect(restored({ ...draft, sending: EDITED_SLEEP }, stored(), NOW, newId).kept).toEqual([])
  })

  it("passes on what it couldn't read, to be written back after its own", () => {
    const fromANewerVersion = { sending: { sheet: "sleep" }, keptAt: NOW }
    expect(restored(null, { entries: [], unreadable: [fromANewerVersion] }, NOW, newId).unreadable).toEqual([
      fromANewerVersion,
    ])
  })
})

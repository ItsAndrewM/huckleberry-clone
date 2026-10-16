import { FeedConflict, NotFound } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import {
  KEPT_KEY,
  type KeptEntry,
  keptAfterFailure,
  keptAfterSend,
  keptWithHeld,
  keptWithout,
  readKept,
  writeKept,
} from "../src/sheets/kept.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { diaper, start } from "./held-fixtures.ts"
import { blocked, memoryStorage } from "./memory-storage.ts"
import { feedAt, NOW } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const OTHER_ID = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"
const DIAPER = diaper(ACTION_ID)
const OTHER_DIAPER = diaper(OTHER_ID)
const KEPT: KeptEntry = { sending: DIAPER, keptAt: NOW, idSince: NOW, failed: true }
const NOTHING_STORED = { entries: [], unreadable: [] }
const FROM_A_NEWER_VERSION = { sending: { sheet: "sleep", action: { kind: "startSleep" } }, keptAt: NOW }

const POO: Sending = {
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: NOW, wet: false, dirty: true } },
}

const PAUSE: Sending = {
  sheet: "nursing",
  action: { kind: "pauseFeed", id: "feed-1", payload: { actionId: OTHER_ID, version: 2, occurredAt: NOW } },
}

const RESUME_ID = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f"

const resume = (side: "left" | "right"): Sending => ({
  sheet: "nursing",
  action: { kind: "resumeFeed", id: "feed-1", payload: { actionId: RESUME_ID, version: 3, side, occurredAt: NOW } },
})

const EDIT_SHEET_DELETE: Sending = {
  sheet: "editSleep",
  action: {
    kind: "deleteSleep",
    id: "sleep-1",
    payload: { actionId: "7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b", version: 2 },
  },
}

describe("entries kept on the phone", () => {
  it("keeps them, reads them back, and clears the key once none are left", () => {
    const { storage, items } = memoryStorage()
    expect(writeKept(() => storage, [KEPT], [])).toBe(true)
    expect(readKept(() => storage)).toEqual({ entries: [KEPT], unreadable: [] })
    expect(writeKept(() => storage, [], [])).toBe(true)
    expect(items.has(KEPT_KEY)).toBe(false)
    expect(readKept(() => storage)).toEqual(NOTHING_STORED)
  })

  it("keeps a record it can't read, such as one from a newer version, and writes it back after its own", () => {
    const { storage, items } = memoryStorage()
    items.set(KEPT_KEY, JSON.stringify([FROM_A_NEWER_VERSION, KEPT]))
    const stored = readKept(() => storage)
    expect(stored).toEqual({ entries: [KEPT], unreadable: [FROM_A_NEWER_VERSION] })
    expect(writeKept(() => storage, [], stored.unreadable)).toBe(true)
    expect(JSON.parse(items.get(KEPT_KEY) ?? "null")).toEqual([FROM_A_NEWER_VERSION])
  })

  it("reads back a control kept on Nursing or Sleep, drops one from an Edit sheet, and reads nothing from what isn't a list", () => {
    const { storage, items } = memoryStorage()
    const pause = { ...KEPT, sending: PAUSE }
    items.set(KEPT_KEY, JSON.stringify([pause, { ...KEPT, sending: EDIT_SHEET_DELETE }]))
    expect(readKept(() => storage)).toEqual({ entries: [pause], unreadable: [] })
    items.set(KEPT_KEY, "not JSON")
    expect(readKept(() => storage)).toEqual(NOTHING_STORED)
    items.set(KEPT_KEY, JSON.stringify({ sending: DIAPER }))
    expect(readKept(() => storage)).toEqual(NOTHING_STORED)
  })

  it("says when the phone won't keep them, and reads nothing from storage it can't open", () => {
    const { storage } = memoryStorage()
    expect(writeKept(() => ({ ...storage, setItem: blocked }), [KEPT], [])).toBe(false)
    expect(writeKept(blocked, [], [])).toBe(false)
    expect(readKept(blocked)).toEqual(NOTHING_STORED)
  })
})

describe("what's kept", () => {
  it("keeps a new entry from its send, and never a control", () => {
    expect(keptAfterSend([], DIAPER, NOW)).toEqual([{ sending: DIAPER, keptAt: NOW, idSince: NOW, failed: false }])
    const none: ReadonlyArray<KeptEntry> = []
    expect(keptAfterSend(none, PAUSE, NOW)).toBe(none)
  })

  it("marks an entry that failed, and keeps when it and its actionId were first kept through every retry", () => {
    const failed = keptAfterFailure(
      keptAfterSend([], DIAPER, NOW),
      { sending: DIAPER, error: new Offline() },
      NOW + 5000,
    )
    expect(failed).toEqual([{ sending: DIAPER, keptAt: NOW, idSince: NOW, failed: true }])
    expect(keptAfterSend(failed, POO, NOW + 9000)).toEqual([{ sending: POO, keptAt: NOW, idSince: NOW, failed: false }])
  })

  it("lets an entry go once it can't be saved as it is, and leaves the list alone when a control fails", () => {
    const started = start(ACTION_ID)
    const sent = keptAfterSend([], started, NOW)
    const theirs = new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: feedAt(NOW) })
    expect(keptAfterFailure(sent, { sending: started, error: theirs }, NOW)).toEqual([])
    expect(keptAfterFailure(sent, { sending: PAUSE, error: new Offline() }, NOW)).toBe(sent)
  })

  it("lets an entry go by its actionId, and keeps the same list when it isn't there", () => {
    const entries = keptAfterSend(keptAfterSend([], DIAPER, NOW), OTHER_DIAPER, NOW + 1000)
    expect(keptWithout(entries, ACTION_ID)).toEqual([
      { sending: OTHER_DIAPER, keptAt: NOW + 1000, idSince: NOW + 1000, failed: false },
    ])
    expect(keptWithout(entries, "6f1d2c3b-4a5e-4b6c-8d7e-9f0a1b2c3d4e")).toBe(entries)
  })
})

describe("controls kept in step with what's held", () => {
  const offline = (sending: Sending): Failed => ({ sending, error: new Offline() })
  const PAUSE_KEPT: KeptEntry = { sending: PAUSE, keptAt: NOW, idSince: NOW, failed: true }

  it("keeps a control held on Nursing or Sleep from when it was first kept, returning the same list while nothing changes", () => {
    const kept = keptWithHeld([], [offline(PAUSE)], null, NOW)
    expect(kept).toEqual([PAUSE_KEPT])
    expect(keptWithHeld(kept, [offline(PAUSE)], null, NOW + 5000)).toBe(kept)
  })

  it("keeps what a control last sent through every retry, from when it was first kept", () => {
    const left = keptWithHeld([], [offline(resume("left"))], null, NOW)
    expect(keptWithHeld(left, [offline(resume("right"))], null, NOW + 5000)).toEqual([
      { sending: resume("right"), keptAt: NOW, idSince: NOW, failed: true },
    ])
  })

  it("keeps a kept control while it's sent again, allowing that it may land, but never a control on its first send", () => {
    expect(keptWithHeld([PAUSE_KEPT], [], PAUSE, NOW + 5000)).toEqual([{ ...PAUSE_KEPT, failed: false }])
    const none: ReadonlyArray<KeptEntry> = []
    expect(keptWithHeld(none, [], PAUSE, NOW)).toBe(none)
  })

  it("lets a control go once it's neither held nor on its way: saved, discarded, replaced, or let go with its sheet", () => {
    expect(keptWithHeld([KEPT, PAUSE_KEPT], [], null, NOW)).toEqual([KEPT])
  })

  it("never keeps a control that can't be saved as it is, or one from an Edit sheet", () => {
    const none: ReadonlyArray<KeptEntry> = []
    const gone = { sending: PAUSE, error: new NotFound() }
    expect(keptWithHeld(none, [gone, offline(EDIT_SHEET_DELETE)], null, NOW)).toBe(none)
  })

  it("leaves the entries as they are, held or not", () => {
    const entries = [KEPT]
    expect(keptWithHeld(entries, [offline(DIAPER)], null, NOW)).toBe(entries)
    expect(keptWithHeld(entries, [offline(DIAPER), offline(PAUSE)], null, NOW)).toEqual([KEPT, PAUSE_KEPT])
  })
})

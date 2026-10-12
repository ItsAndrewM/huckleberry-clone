import { describe, expect, it } from "vitest"
import {
  KEPT_KEY,
  type KeptEntry,
  keptFailed,
  keptSending,
  keptWithout,
  readKept,
  writeKept,
} from "../src/sheets/kept.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { diaper } from "./held-fixtures.ts"
import { blocked, memoryStorage } from "./memory-storage.ts"
import { NOW } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const OTHER_ID = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"
const DIAPER = diaper(ACTION_ID)
const OTHER_DIAPER = diaper(OTHER_ID)
const KEPT: KeptEntry = { sending: DIAPER, keptAt: NOW, failed: true }

const POO: Sending = {
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: NOW, wet: false, dirty: true } },
}

describe("entries kept on the phone", () => {
  it("keeps them, reads them back, and clears the key once none are left", () => {
    const { storage, items } = memoryStorage()
    expect(writeKept(() => storage, [KEPT])).toBe(true)
    expect(readKept(() => storage)).toEqual([KEPT])
    expect(writeKept(() => storage, [])).toBe(true)
    expect(items.has(KEPT_KEY)).toBe(false)
    expect(readKept(() => storage)).toEqual([])
  })

  it("skips an entry it can't read, such as one from another version, and keeps the rest", () => {
    const { storage, items } = memoryStorage()
    items.set(KEPT_KEY, JSON.stringify([{ sending: { sheet: "sleep" }, keptAt: NOW, failed: true }, KEPT]))
    expect(readKept(() => storage)).toEqual([KEPT])
    items.set(KEPT_KEY, "not JSON")
    expect(readKept(() => storage)).toEqual([])
    items.set(KEPT_KEY, JSON.stringify({ sending: DIAPER }))
    expect(readKept(() => storage)).toEqual([])
  })

  it("says when the phone won't keep them, and reads nothing from storage it can't open", () => {
    const { storage } = memoryStorage()
    expect(writeKept(() => ({ ...storage, setItem: blocked }), [KEPT])).toBe(false)
    expect(writeKept(blocked, [])).toBe(false)
    expect(readKept(blocked)).toEqual([])
  })
})

describe("what's kept", () => {
  it("keeps an entry from its send, marks whether it failed, and keeps the time it was first kept", () => {
    const sending = keptSending([], DIAPER, NOW)
    expect(sending).toEqual([{ sending: DIAPER, keptAt: NOW, failed: false }])
    const failed = keptFailed(sending, DIAPER, NOW + 5000)
    expect(failed).toEqual([{ sending: DIAPER, keptAt: NOW, failed: true }])
    expect(keptSending(failed, POO, NOW + 9000)).toEqual([{ sending: POO, keptAt: NOW, failed: false }])
  })

  it("lets an entry go by its actionId, and keeps the same list when it isn't there", () => {
    const entries = keptFailed(keptFailed([], DIAPER, NOW), OTHER_DIAPER, NOW + 1000)
    expect(keptWithout(entries, ACTION_ID)).toEqual([{ sending: OTHER_DIAPER, keptAt: NOW + 1000, failed: true }])
    expect(keptWithout(entries, "6f1d2c3b-4a5e-4b6c-8d7e-9f0a1b2c3d4e")).toBe(entries)
  })
})

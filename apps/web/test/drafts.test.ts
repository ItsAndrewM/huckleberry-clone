import { describe, expect, it } from "vitest"
import { DRAFT_KEY, DRAFT_RETRY_MS, type Draft, isFresh, stashDraft, takeDraft } from "../src/sheets/drafts.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const AT = Date.UTC(2026, 9, 9, 16, 30)

const DRAFT: Draft = {
  route: "/",
  sending: {
    sheet: "diaper",
    action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: AT, wet: true, dirty: false } },
  },
  createdAt: AT,
}

const memoryStorage = () => {
  const items = new Map<string, string>()
  return {
    items,
    storage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  }
}

const blocked = () => {
  throw new DOMException("The operation is insecure.", "SecurityError")
}

describe("sign-in drafts", () => {
  it("keeps the unsaved entry across the trip to sign in, and hands it back once at the same route", () => {
    const { storage, items } = memoryStorage()
    stashDraft(() => storage, DRAFT)
    expect(takeDraft(() => storage, "/")).toEqual(DRAFT)
    expect(items.has(DRAFT_KEY)).toBe(false)
    expect(takeDraft(() => storage, "/")).toBeNull()
  })

  it("drops a draft that comes back on another route, or that can't be read", () => {
    const { storage, items } = memoryStorage()
    stashDraft(() => storage, DRAFT)
    expect(takeDraft(() => storage, "/settings")).toBeNull()
    expect(items.has(DRAFT_KEY)).toBe(false)
    items.set(DRAFT_KEY, '{"route":"/","sending":{"sheet":"diaper"}}')
    expect(takeDraft(() => storage, "/")).toBeNull()
  })

  it("carries on without a draft when the browser blocks storage", () => {
    expect(() => stashDraft(blocked, DRAFT)).not.toThrow()
    expect(takeDraft(blocked, "/")).toBeNull()
  })

  it("says whether the browser kept the draft, so a refusal can be told to the parent", () => {
    const { storage } = memoryStorage()
    expect(stashDraft(() => storage, DRAFT)).toBe(true)
    expect(stashDraft(blocked, DRAFT)).toBe(false)
    expect(stashDraft(() => ({ ...storage, setItem: blocked }), DRAFT)).toBe(false)
  })

  it("re-sends a draft for 12 hours, half the household's receipt retention", () => {
    expect(isFresh(DRAFT, AT + DRAFT_RETRY_MS - 1)).toBe(true)
    expect(isFresh(DRAFT, AT + DRAFT_RETRY_MS)).toBe(false)
  })
})

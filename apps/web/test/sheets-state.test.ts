import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { Offline } from "../src/api/errors.ts"
import { DRAFT_RETRY_MS, StaleDraft } from "../src/sheets/drafts.ts"
import { closesOnSend, type Sending } from "../src/sheets/sending.ts"
import {
  CLOSED,
  expiredState,
  failedState,
  isEntry,
  restoredState,
  savedState,
  sendingState,
} from "../src/sheets/sheets-state.ts"
import { TOAST_MS } from "../src/sheets/undo.ts"
import { diaperAt, feedAt, NOW } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const RENEWED = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"

const DIAPER: Sending = {
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false } },
}

const OTHER_DIAPER: Sending = {
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId: RENEWED, occurredAt: NOW - 60_000, wet: false, dirty: true } },
}

const SWITCH: Sending = {
  sheet: "nursing",
  action: { kind: "switchSide", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: NOW } },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const STARTED: Sending = {
  sheet: "nursing",
  action: { kind: "startFeed", payload: { actionId: ACTION_ID, side: "left", startedAt: NOW } },
}

const BOTTLE_FEED: Sending = {
  sheet: "bottle",
  action: {
    kind: "logFeed",
    payload: { actionId: ACTION_ID, segments: [], portions: [{ occurredAt: NOW, breastMilkMl: 40, formulaMl: 0 }] },
  },
}

const PAST_FEED: Sending = {
  sheet: "pastFeed",
  action: {
    kind: "logFeed",
    payload: {
      actionId: ACTION_ID,
      segments: [
        { side: "left", startedAt: NOW - 1_800_000, endedAt: NOW - 1_200_000 },
        { side: "right", startedAt: NOW - 1_200_000, endedAt: NOW - 600_000 },
      ],
      portions: [],
    },
  },
}

const PAUSE: Sending = {
  sheet: "nursing",
  action: { kind: "pauseFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: NOW } },
}

const RESUME: Sending = {
  sheet: "nursing",
  action: {
    kind: "resumeFeed",
    id: "feed-1",
    payload: { actionId: ACTION_ID, version: 3, side: "right", occurredAt: NOW },
  },
}

const ADD_BOTTLE: Sending = {
  sheet: "bottle",
  action: {
    kind: "addBottle",
    id: "feed-1",
    payload: { actionId: ACTION_ID, version: 3, occurredAt: NOW, breastMilkMl: 40, formulaMl: 0 },
  },
}

const FINISH: Sending = {
  sheet: "nursing",
  action: {
    kind: "finishFeed",
    id: "feed-1",
    payload: { actionId: ACTION_ID, version: 3, occurredAt: NOW, deleteIfEmpty: false },
  },
}

const UNDO_DIAPER: Sending = {
  sheet: "diaper",
  action: { kind: "deleteDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 1 } },
}

const UNDO_FEED: Sending = {
  sheet: "nursing",
  action: { kind: "deleteFeed", id: "feed-7", payload: { actionId: ACTION_ID, version: 2 } },
}

const UNDO_PORTION: Sending = {
  sheet: "bottle",
  action: {
    kind: "deletePortion",
    id: "portion-9",
    payload: { actionId: ACTION_ID, version: 3, deleteIfEmpty: false },
  },
}

const CLOSING = {
  logDiaper: { sending: DIAPER, closes: true, entry: true },
  deleteDiaper: { sending: UNDO_DIAPER, closes: false, entry: false },
  logFeed: { sending: BOTTLE_FEED, closes: true, entry: true },
  startFeed: { sending: STARTED, closes: true, entry: true },
  switchSide: { sending: SWITCH, closes: false, entry: false },
  pauseFeed: { sending: PAUSE, closes: false, entry: false },
  resumeFeed: { sending: RESUME, closes: false, entry: false },
  addBottle: { sending: ADD_BOTTLE, closes: true, entry: true },
  finishFeed: { sending: FINISH, closes: true, entry: false },
  deleteFeed: { sending: UNDO_FEED, closes: false, entry: false },
  deletePortion: { sending: UNDO_PORTION, closes: false, entry: false },
} satisfies Record<Action["kind"], { readonly sending: Sending; readonly closes: boolean; readonly entry: boolean }>

describe("sending", () => {
  it("closes a sheet that creates an entry while online, so the entry shows at once", () => {
    expect(sendingState({ ...CLOSED, open: "diaper" }, DIAPER, true).open).toBeNull()
  })

  it("keeps the sheet open offline, and for a running feed's controls", () => {
    expect(sendingState({ ...CLOSED, open: "diaper" }, DIAPER, false).open).toBe("diaper")
    expect(sendingState({ ...CLOSED, open: "nursing" }, SWITCH, true).open).toBe("nursing")
  })
})

describe("a failed send", () => {
  it("reopens its sheet with the reason, holding the entry", () => {
    const failed = { sending: DIAPER, error: new Offline() }
    expect(failedState(CLOSED, failed, NOW)).toEqual({ ...CLOSED, open: "diaper", opened: 1, held: [failed] })
  })

  it("says so in a toast when it was an undo", () => {
    const undo: Sending = {
      sheet: "diaper",
      action: { kind: "deleteDiaper", id: "d1", payload: { actionId: ACTION_ID, version: 1 } },
    }
    const state = failedState(CLOSED, { sending: undo, error: new Offline() }, NOW)
    expect(state).toEqual({
      ...CLOSED,
      toast: { message: "No connection, so that wasn't undone.", undo: null, until: NOW + TOAST_MS },
    })
  })
})

describe("a saved entry", () => {
  it("offers to undo a diaper with the version the household answered", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1", version: 1 })
    const { toast } = savedState(CLOSED, DIAPER, { diaper, changed: [] }, NOW)
    expect(toast).toMatchObject({
      message: "Diaper saved",
      until: NOW + TOAST_MS,
      undo: { sheet: "diaper", action: { kind: "deleteDiaper", id: "diaper-1", payload: { version: 1 } } },
    })
  })

  it("offers to undo a bottle added to a running feed by deleting just that bottle", () => {
    const portion = { occurredAt: NOW, breastMilkMl: 40, formulaMl: 0 }
    const sending: Sending = {
      sheet: "bottle",
      action: { kind: "addBottle", id: "feed-1", payload: { actionId: ACTION_ID, version: 2, ...portion } },
    }
    const feed = feedAt(NOW - 600_000, { id: "feed-1", version: 3, portions: [{ id: "portion-9", ...portion }] })
    const { toast } = savedState(CLOSED, sending, { feed, changed: [] }, NOW)
    expect(toast?.undo?.action).toMatchObject({
      kind: "deletePortion",
      id: "portion-9",
      payload: { version: 3, deleteIfEmpty: false },
    })
  })

  it("lets the toast go once its time is up, but not before", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1" })
    const state = savedState(CLOSED, DIAPER, { diaper, changed: [] }, NOW)
    expect(expiredState(state, NOW + TOAST_MS - 1)).toBe(state)
    expect(expiredState(state, NOW + TOAST_MS).toast).toBeNull()
  })

  it("has nothing to undo for a running feed's controls", () => {
    const feed = feedAt(NOW, { id: "feed-1", version: 4 })
    expect(savedState(CLOSED, SWITCH, { feed, changed: [] }, NOW).toast).toBeNull()
  })
})

describe("a draft back from signing in", () => {
  const draft = { route: "/", sending: DIAPER, createdAt: NOW }

  it("leaves a fresh draft to be re-sent as it was", () => {
    expect(restoredState(draft, NOW + 1000, RENEWED)).toEqual(CLOSED)
    expect(restoredState(null, NOW, RENEWED)).toEqual(CLOSED)
  })

  it("asks before saving a draft past the retry window, with a new actionId, holding it like any failed entry", () => {
    const state = restoredState(draft, NOW + DRAFT_RETRY_MS, RENEWED)
    expect(state.open).toBe("diaper")
    expect(state.held).toHaveLength(1)
    expect(state.held[0]?.error).toEqual(new StaleDraft({ createdAt: NOW }))
    expect(state.held[0]?.sending.action.payload.actionId).toBe(RENEWED)
  })
})

describe("a conflict", () => {
  it("shows in the running feed's open sheet with the household's copy", () => {
    const current = feedAt(NOW, { id: "feed-1", version: 4 })
    const failed = { sending: SWITCH, error: new FeedConflict({ code: "STALE_VERSION", current }) }
    expect(failedState({ ...CLOSED, open: "nursing" }, failed, NOW)).toMatchObject({ open: "nursing", held: [failed] })
  })
})

describe("the Undo for a new feed", () => {
  it.each([
    { message: "Feed started", sending: STARTED },
    { message: "Bottle saved", sending: BOTTLE_FEED },
    { message: "Feed saved", sending: PAST_FEED },
  ])("$message offers to delete the feed at the version the household answered", ({ message, sending }) => {
    const feed = feedAt(NOW, { id: "feed-7", version: 2 })
    const { toast } = savedState(CLOSED, sending, { feed, changed: [] }, NOW)
    expect(toast).toMatchObject({
      message,
      undo: { sheet: sending.sheet, action: { kind: "deleteFeed", id: "feed-7", payload: { version: 2 } } },
    })
  })
})

describe("the Undo for a bottle added to a feed", () => {
  it("targets the newest portion that matches the bottle in time and amounts", () => {
    const bottle = { occurredAt: NOW - 600_000, breastMilkMl: 40, formulaMl: 0 }
    const sending: Sending = {
      sheet: "bottle",
      action: { kind: "addBottle", id: "feed-1", payload: { actionId: ACTION_ID, version: 2, ...bottle } },
    }
    const portions = [
      { id: "portion-earlier-other", occurredAt: NOW - 1_800_000, breastMilkMl: 60, formulaMl: 0 },
      { id: "portion-earlier-same", ...bottle },
      { id: "portion-newest-same", ...bottle },
      { id: "portion-other-time", ...bottle, occurredAt: NOW },
      { id: "portion-other-breast", ...bottle, breastMilkMl: 60 },
      { id: "portion-other-formula", ...bottle, formulaMl: 30 },
    ]
    const feed = feedAt(NOW - 1_800_000, { id: "feed-1", version: 3, portions })
    const { toast } = savedState(CLOSED, sending, { feed, changed: [] }, NOW)
    expect(toast?.undo?.action).toMatchObject({
      kind: "deletePortion",
      id: "portion-newest-same",
      payload: { version: 3, deleteIfEmpty: false },
    })
  })
})

describe("the Undo's own action", () => {
  it.each([
    { label: "a diaper", sending: DIAPER, saved: { diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] } },
    { label: "a started feed", sending: STARTED, saved: { feed: feedAt(NOW, { id: "feed-7" }), changed: [] } },
  ])("for $label, gets a fresh actionId, not the create's", ({ sending, saved }) => {
    const { toast } = savedState(CLOSED, sending, saved, NOW)
    const actionId = toast?.undo?.action.payload.actionId
    expect(actionId).toMatch(UUID)
    expect(actionId).not.toBe(ACTION_ID)
  })
})

describe("what a send clears", () => {
  it.each([
    { kind: "deleteDiaper", sending: UNDO_DIAPER },
    { kind: "deleteFeed", sending: UNDO_FEED },
    { kind: "deletePortion", sending: UNDO_PORTION },
  ])("an Undo send ($kind) clears the toast, and keeps another entry held", ({ sending }) => {
    const { toast } = savedState(CLOSED, DIAPER, { diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] }, NOW)
    const failed = { sending: OTHER_DIAPER, error: new Offline() }
    const state = sendingState({ ...CLOSED, open: "diaper", toast, held: [failed] }, sending, true)
    expect(state).toMatchObject({ toast: null, held: [failed] })
  })

  it("a create keeps a toast that is still showing, and its own entry is no longer held", () => {
    const earlier = savedState(CLOSED, DIAPER, { diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] }, NOW)
    const failed = { sending: DIAPER, error: new Offline() }
    const state = sendingState({ ...earlier, open: "diaper", held: [failed] }, DIAPER, true)
    expect(state.toast).toBe(earlier.toast)
    expect(state.held).toEqual([])
  })
})

describe("which sends close their sheet", () => {
  it.each(Object.entries(CLOSING))("closes on send: %s", (_kind, { sending, closes }) => {
    expect(closesOnSend(sending)).toBe(closes)
  })
})

describe("which sends are new entries, held until they're saved or discarded", () => {
  it.each(Object.entries(CLOSING))("a new entry: %s", (_kind, { sending, entry }) => {
    expect(isEntry(sending)).toBe(entry)
  })
})

describe("a failed create", () => {
  it("keeps a toast that is still showing", () => {
    const earlier = savedState(CLOSED, DIAPER, { diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] }, NOW)
    const state = failedState(earlier, { sending: BOTTLE_FEED, error: new Offline() }, NOW + 1_000)
    expect(state).toMatchObject({ open: "bottle", held: [{ sending: BOTTLE_FEED }] })
    expect(state.toast).toBe(earlier.toast)
  })
})

describe("an older toast's sweep", () => {
  it("leaves a newer toast in place when the older toast's time is up", () => {
    const older = savedState(CLOSED, DIAPER, { diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] }, NOW)
    const newer = savedState(
      older,
      DIAPER,
      { diaper: diaperAt(NOW + 2_000, { id: "diaper-2" }), changed: [] },
      NOW + 2_000,
    )
    expect(expiredState(newer, NOW + TOAST_MS).toast).toBe(newer.toast)
  })
})

describe("a failed Undo", () => {
  it("says it wasn't undone when the error is not being offline", () => {
    const current = feedAt(NOW, { id: "feed-1", version: 4 })
    const undo: Sending = {
      sheet: "nursing",
      action: { kind: "deleteFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 3 } },
    }
    const error = new FeedConflict({ code: "STALE_VERSION", current })
    expect(failedState(CLOSED, { sending: undo, error }, NOW)).toEqual({
      ...CLOSED,
      toast: { message: "That wasn't undone.", undo: null, until: NOW + TOAST_MS },
    })
  })
})

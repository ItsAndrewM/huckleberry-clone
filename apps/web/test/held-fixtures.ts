import { Offline } from "../src/api/errors.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { CLOSED, failedState } from "../src/sheets/sheets-state.ts"
import { diaperAt, NOW } from "./today-fixtures.ts"

export const diaper = (actionId: string): Sending => ({
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId, occurredAt: NOW, wet: true, dirty: false } },
})

export const start = (actionId: string): Sending => ({
  sheet: "nursing",
  action: { kind: "startFeed", payload: { actionId, side: "left", startedAt: NOW } },
})

export const BOTTLE: Sending = {
  sheet: "bottle",
  action: {
    kind: "logFeed",
    payload: {
      actionId: "action-bottle",
      segments: [],
      portions: [{ occurredAt: NOW, breastMilkMl: 50, formulaMl: 0 }],
    },
  },
}

export const DIAPER = diaper("action-diaper")
export const held = (sending: Sending): Failed => ({ sending, error: new Offline() })
export const DIAPER_HELD = held(DIAPER)
export const BOTTLE_HELD = held(BOTTLE)
export const SAVED_DIAPER = { diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] }

export const afterFailures = (...failures: ReadonlyArray<Failed>) =>
  failures.reduce((state, failed) => failedState(state, failed, NOW), CLOSED)

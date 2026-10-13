import type { Diaper, Feed, Sleep, VersionedPortion } from "@bt/contracts"
import type { Action } from "../api/actions.ts"
import { Offline } from "../api/errors.ts"
import type { Saved } from "../api/send.ts"
import { isUndo, type Sending } from "./sending.ts"

export interface Toast {
  readonly message: string
  readonly undo: Sending | null
  readonly until: number
}

export const TOAST_MS = 5_000

const addedPortion = (feed: Feed, sent: VersionedPortion) =>
  feed.portions.findLast(
    (portion) =>
      portion.occurredAt === sent.occurredAt &&
      portion.breastMilkMl === sent.breastMilkMl &&
      portion.formulaMl === sent.formulaMl,
  )

const undoFeed = (action: Action, feed: Feed, actionId: string): Action | null => {
  const versioned = { actionId, version: feed.version }
  if (action.kind === "logFeed" || action.kind === "startFeed")
    return { kind: "deleteFeed", id: feed.id, payload: versioned }
  if (action.kind === "deleteFeed") return { kind: "restoreFeed", id: feed.id, payload: versioned }
  if (action.kind !== "addBottle") return null
  const portion = addedPortion(feed, action.payload)
  if (portion === undefined) return null
  return { kind: "deletePortion", id: portion.id, payload: { ...versioned, deleteIfEmpty: false } }
}

const undoDiaper = (action: Action, { id, version }: Diaper, actionId: string): Action | null => {
  if (action.kind === "logDiaper") return { kind: "deleteDiaper", id, payload: { actionId, version } }
  return action.kind === "deleteDiaper" ? { kind: "restoreDiaper", id, payload: { actionId, version } } : null
}

const undoSleep = (action: Action, { id, version }: Sleep, actionId: string): Action | null => {
  if (action.kind === "logSleep" || action.kind === "startSleep") {
    return { kind: "deleteSleep", id, payload: { actionId, version } }
  }
  return action.kind === "deleteSleep" ? { kind: "restoreSleep", id, payload: { actionId, version } } : null
}

export const undoOf = ({ action }: Sending, saved: Saved, actionId: string): Action | null => {
  if ("sleep" in saved) return undoSleep(action, saved.sleep, actionId)
  if ("feed" in saved) return undoFeed(action, saved.feed, actionId)
  return "diaper" in saved ? undoDiaper(action, saved.diaper, actionId) : null
}

const feedNoun = (saved: Saved) => ("feed" in saved && saved.feed.segments.length === 0 ? "Bottle" : "Feed")

const MESSAGES = new Map<Action["kind"], string>([
  ["logDiaper", "Diaper saved"],
  ["startFeed", "Feed started"],
  ["addBottle", "Bottle added to the feed"],
  ["deleteDiaper", "Diaper deleted"],
  ["logSleep", "Sleep saved"],
  ["startSleep", "Sleep started"],
  ["deleteSleep", "Sleep deleted"],
])

const messageOf = ({ sheet, action }: Sending, saved: Saved): string | null => {
  if (action.kind === "logFeed") return sheet === "pastFeed" ? "Feed saved" : "Bottle saved"
  if (action.kind === "deleteFeed") return `${feedNoun(saved)} deleted`
  return MESSAGES.get(action.kind) ?? null
}

export const toastFor = (sending: Sending, saved: Saved, now: number): Toast | null => {
  const message = isUndo(sending) ? null : messageOf(sending, saved)
  if (message === null) return null
  const undo = undoOf(sending, saved, crypto.randomUUID())
  return { message, undo: undo === null ? null : { sheet: "undo", action: undo }, until: now + TOAST_MS }
}

export const restoredToast = (saved: Saved, now: number, actionId: string): Toast => {
  const until = now + TOAST_MS
  if ("diaper" in saved) {
    const { id, version } = saved.diaper
    const action = { kind: "deleteDiaper", id, payload: { actionId, version } } as const
    return { message: "Diaper restored", undo: { sheet: "undo", action }, until }
  }
  if ("sleep" in saved) {
    const { id, version } = saved.sleep
    const action = { kind: "deleteSleep", id, payload: { actionId, version } } as const
    return { message: "Sleep restored", undo: { sheet: "undo", action }, until }
  }
  if (!("feed" in saved)) return { message: "Measurement restored", undo: null, until }
  const { id, version } = saved.feed
  const action = { kind: "deleteFeed", id, payload: { actionId, version } } as const
  return { message: `${feedNoun(saved)} restored`, undo: { sheet: "undo", action }, until }
}

interface LostMessages {
  readonly offline: string
  readonly otherwise: string
}

const lostToast =
  ({ offline, otherwise }: LostMessages) =>
  (error: Error, now: number): Toast => ({
    message: error instanceof Offline ? offline : otherwise,
    undo: null,
    until: now + TOAST_MS,
  })

export const undoLost = lostToast({
  offline: "No connection, so that wasn't undone.",
  otherwise: "That wasn't undone.",
})

export const editLost = lostToast({
  offline: "No connection, so your changes weren't saved.",
  otherwise: "Your changes weren't saved.",
})

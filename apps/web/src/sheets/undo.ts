import type { Feed, VersionedPortion } from "@bt/contracts"
import type { Action } from "../api/actions.ts"
import type { Saved } from "../api/send.ts"
import type { Sending } from "./sending.ts"

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
  if (action.kind === "logFeed" || action.kind === "startFeed") {
    return { kind: "deleteFeed", id: feed.id, payload: { actionId, version: feed.version } }
  }
  if (action.kind !== "addBottle") return null
  const portion = addedPortion(feed, action.payload)
  if (portion === undefined) return null
  return { kind: "deletePortion", id: portion.id, payload: { actionId, version: feed.version, deleteIfEmpty: false } }
}

export const undoOf = ({ action }: Sending, saved: Saved, actionId: string): Action | null => {
  if ("feed" in saved) return undoFeed(action, saved.feed, actionId)
  if (action.kind !== "logDiaper") return null
  return { kind: "deleteDiaper", id: saved.diaper.id, payload: { actionId, version: saved.diaper.version } }
}

const messageOf = ({ sheet, action }: Sending): string | null => {
  switch (action.kind) {
    case "logDiaper":
      return "Diaper saved"
    case "logFeed":
      return sheet === "pastFeed" ? "Feed saved" : "Bottle saved"
    case "startFeed":
      return "Feed started"
    case "addBottle":
      return "Bottle added to the feed"
    default:
      return null
  }
}

export const toastFor = (sending: Sending, saved: Saved, now: number): Toast | null => {
  const message = messageOf(sending)
  if (message === null) return null
  const undo = undoOf(sending, saved, crypto.randomUUID())
  return { message, undo: undo === null ? null : { sheet: sending.sheet, action: undo }, until: now + TOAST_MS }
}

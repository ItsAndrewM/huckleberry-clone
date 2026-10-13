import type { Feed, Measurement, Side } from "@bt/contracts"
import type { Action } from "../api/actions.ts"
import { SIDE_NAMES } from "../sides.ts"
import type { Recovery, Sending } from "./sending.ts"

const REDO_LABELS = new Map<Action["kind"], string>([
  ["switchSide", "Switch anyway"],
  ["pauseFeed", "Pause anyway"],
  ["resumeFeed", "Resume anyway"],
  ["finishFeed", "Finish anyway"],
  ["addBottle", "Add it anyway"],
  ["editSegment", "Change it anyway"],
  ["deleteFeed", "Delete anyway"],
])

const openSideOf = (feed: Feed) => feed.segments.find(({ endedAt }) => endedAt === null) ?? null

const runningSince = (feed: Feed, at: number) => {
  const open = openSideOf(feed)
  return open !== null && open.startedAt <= at
}

const switchFits = (feed: Feed, to: Side | undefined, at: number) =>
  to !== undefined && runningSince(feed, at) && openSideOf(feed)?.side !== to

const segmentOf = (feed: Feed, segmentId: string) => feed.segments.find(({ id }) => id === segmentId)

const startStillFits = (feed: Feed, segmentId: string, startedAt: number) => {
  const segment = segmentOf(feed, segmentId)
  return segment !== undefined && (segment.endedAt === null || startedAt < segment.endedAt)
}

const fits = (action: Action, feed: Feed) => {
  switch (action.kind) {
    case "switchSide":
      return switchFits(feed, action.to, action.payload.occurredAt)
    case "pauseFeed":
      return runningSince(feed, action.payload.occurredAt)
    case "resumeFeed":
      return openSideOf(feed) === null
    case "finishFeed":
      return (
        !action.payload.deleteIfEmpty && (openSideOf(feed) === null || runningSince(feed, action.payload.occurredAt))
      )
    case "addBottle":
      return action.payload.occurredAt >= feed.startedAt
    case "editSegment":
      return startStillFits(feed, action.id, action.payload.startedAt)
    case "deleteFeed":
      return true
    default:
      return false
  }
}

const withVersion = <Sent extends Action>(action: Sent, version: number): Sent => ({
  ...action,
  payload: { ...action.payload, version },
})

const resent = (action: Action, feed: Feed): Action => {
  const versioned = withVersion(action, feed.version)
  if (versioned.kind !== "editSegment") return versioned
  const { side, endedAt } = segmentOf(feed, versioned.id) ?? versioned.payload
  return { ...versioned, payload: { ...versioned.payload, side, endedAt } }
}

export const redone = ({ sheet, action }: Sending, feed: Feed): Recovery | null => {
  const label = REDO_LABELS.get(action.kind)
  const live = feed.status === "active" && feed.deletedAt === null
  if (label === undefined || !live || !fits(action, feed)) return null
  return { label, sendingAt: () => ({ sheet, action: resent(action, feed) }) }
}

export const joined = ({ action }: Sending, feed: Feed): Recovery | null => {
  if (action.kind !== "startFeed") return null
  const { side } = action.payload
  const open = openSideOf(feed)
  if (open?.side === side) return null
  const id = feed.id
  const version = feed.version
  if (open === null) {
    return {
      label: `Resume on ${SIDE_NAMES[side]}`,
      sendingAt: ({ at, actionId }) => ({
        sheet: "nursing",
        action: { kind: "resumeFeed", id, payload: { actionId, version, side, occurredAt: at } },
      }),
    }
  }
  return {
    label: `Switch to ${SIDE_NAMES[side]}`,
    sendingAt: ({ at, actionId }) => ({
      sheet: "nursing",
      action: { kind: "switchSide", id, to: side, payload: { actionId, version, occurredAt: at } },
    }),
  }
}

export const mineAnyway = ({ sheet, action }: Sending, current: Measurement): Recovery | null => {
  if (action.kind !== "editMeasurement" || current.deletedAt !== null) return null
  return { label: "Save mine anyway", sendingAt: () => ({ sheet, action: withVersion(action, current.version) }) }
}

import { DiaperConflict, FeedConflict, type RecentEntry } from "@bt/contracts"
import type { Action } from "../../api/actions.ts"
import { recordOf } from "../../api/today-change.ts"
import type { Failed, Sending } from "../../sheets/sending.ts"
import { entryName } from "../history/entry-labels.ts"
import type { Display } from "../today/display.ts"

export interface Stale {
  readonly current: RecentEntry
  readonly deleting: boolean
}

const DELETES = new Set<Action["kind"]>(["deleteDiaper", "deleteFeed"])

export const staleOf = ({ sending, error }: Failed): Stale | null => {
  const deleting = DELETES.has(sending.action.kind)
  if (error instanceof DiaperConflict && error.code === "STALE_VERSION") {
    return { current: { kind: "diaper", diaper: error.current }, deleting }
  }
  if (error instanceof FeedConflict && error.code === "STALE_VERSION") {
    return { current: { kind: "feed", feed: error.current }, deleting }
  }
  return null
}

const withVersion = <Sent extends Action>(action: Sent, version: number): Sent => ({
  ...action,
  payload: { ...action.payload, version },
})

export const sentAnyway = ({ sheet, action }: Sending, current: RecentEntry): Sending => ({
  sheet,
  action: withVersion(action, recordOf(current).version),
})

export const whoChanged = ({ caregivers }: Display, current: RecentEntry) =>
  caregivers.find(({ id }) => id === recordOf(current).updatedBy)?.displayName ?? "The other phone"

export const staleMessage = (display: Display, { current, deleting }: Stale, now: number) => {
  const who = whoChanged(display, current)
  if (recordOf(current).deletedAt !== null) return `${who} deleted this a moment ago.`
  const changed = `${who} changed this a moment ago. It now reads: ${entryName(current, display, now)}.`
  return deleting ? `${changed} Delete it anyway?` : changed
}

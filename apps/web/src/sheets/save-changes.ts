import type { Diaper, Feed } from "@bt/contracts"
import type { Recovery, Sending } from "./sending.ts"

const SAVE_CHANGES = "Save my changes"

export const diaperEdit = ({ sheet, action }: Sending, saved: Diaper): Recovery | null => {
  if (action.kind !== "logDiaper") return null
  const { occurredAt, wet, dirty } = action.payload
  return {
    label: SAVE_CHANGES,
    sendingAt: ({ actionId }) => ({
      sheet,
      action: {
        kind: "editDiaper",
        id: saved.id,
        payload: { actionId, version: saved.version, occurredAt, wet, dirty },
      },
    }),
  }
}

export const bottleEdit = ({ sheet, action }: Sending, saved: Feed): Recovery | null => {
  if (action.kind !== "logFeed" || action.payload.segments.length > 0) return null
  const [mine] = action.payload.portions
  const [portion] = saved.portions
  if (mine === undefined || portion === undefined || saved.portions.length > 1 || saved.segments.length > 0) return null
  return {
    label: SAVE_CHANGES,
    sendingAt: ({ actionId }) => ({
      sheet,
      action: { kind: "editPortion", id: portion.id, payload: { actionId, version: saved.version, ...mine } },
    }),
  }
}

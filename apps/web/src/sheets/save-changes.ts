import type { Diaper, Feed, Measurement } from "@bt/contracts"
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

const UNTOUCHED = 1

export const feedReplay = ({ sheet, action }: Sending, saved: Feed): Recovery | null => {
  if (action.kind !== "logFeed" || saved.version !== UNTOUCHED || saved.status !== "completed") return null
  const { segments, portions } = action.payload
  return {
    label: SAVE_CHANGES,
    sendingAt: ({ actionId }) => ({
      sheet,
      action: { kind: "editFeed", id: saved.id, payload: { actionId, version: saved.version, segments, portions } },
    }),
  }
}

export const measurementReplay = ({ sheet, action }: Sending, saved: Measurement): Recovery | null => {
  if (action.kind !== "logMeasurement" || saved.version !== UNTOUCHED) return null
  const { measuredAt, weightG, lengthCm, headCm } = action.payload
  return {
    label: SAVE_CHANGES,
    sendingAt: ({ actionId }) => ({
      sheet,
      action: {
        kind: "editMeasurement",
        id: saved.id,
        payload: { actionId, version: saved.version, measuredAt, weightG, lengthCm, headCm },
      },
    }),
  }
}

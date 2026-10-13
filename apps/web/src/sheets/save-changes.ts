import type { Diaper, Feed, Measurement, Sleep } from "@bt/contracts"
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

export const feedReplay = ({ sheet, action }: Sending, saved: Feed): Recovery | null => {
  if (action.kind !== "logFeed") return null
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
  if (action.kind !== "logMeasurement") return null
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

export const sleepReplay = ({ sheet, action }: Sending, saved: Sleep): Recovery | null => {
  if (action.kind !== "logSleep") return null
  const { kind, startedAt, endedAt } = action.payload
  return {
    label: SAVE_CHANGES,
    sendingAt: ({ actionId }) => ({
      sheet,
      action: {
        kind: "editSleep",
        id: saved.id,
        payload: { actionId, version: saved.version, kind, startedAt, endedAt },
      },
    }),
  }
}

import { Schema } from "effect"
import { Changed } from "./query-keys.ts"

export const SOCKET_PATH = "/api/ws"

export const HEARTBEAT = { ping: "ping", pong: "pong" } as const

export const CAREGIVER_DISABLED = { code: 4401, reason: "caregiver disabled" } as const

export const ChangedMessage = Schema.Struct({ changed: Changed })
export type ChangedMessage = typeof ChangedMessage.Type

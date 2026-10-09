import { type Changed, ChangedMessage, HEARTBEAT, Unauthorized } from "@bt/contracts"
import { Schema } from "effect"
import { activeCaregiver } from "./core/caregivers.ts"
import { errorResponse } from "./error-response.ts"

export type Broadcast = (changed: Changed) => void

const caregiverTag = (caregiverId: string) => `caregiver:${caregiverId}`

const messageJson = Schema.encodeSync(Schema.fromJsonString(ChangedMessage))

export const heartbeat = () => new WebSocketRequestResponsePair(HEARTBEAT.ping, HEARTBEAT.pong)

const upgradeRequired = () =>
  new Response(null, { status: 426, headers: { upgrade: "websocket", "cache-control": "no-store" } })

export const acceptSocket = (ctx: DurableObjectState, request: Request): Response => {
  const caregiver = activeCaregiver(ctx.storage.sql, request.headers.get("x-bt-email") ?? undefined)
  if (caregiver === undefined) return errorResponse(new Unauthorized())
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return upgradeRequired()
  const { 0: client, 1: server } = new WebSocketPair()
  ctx.acceptWebSocket(server, [caregiverTag(caregiver.id)])
  return new Response(null, { status: 101, webSocket: client, headers: { "cache-control": "no-store" } })
}

export const broadcastTo =
  (ctx: DurableObjectState): Broadcast =>
  (changed) => {
    const message = messageJson({ changed })
    for (const socket of ctx.getWebSockets()) socket.send(message)
  }

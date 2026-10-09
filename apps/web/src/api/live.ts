import { QueryKey, SOCKET_PATH } from "@bt/contracts"
import { Option, Schema } from "effect"
import type { Signal } from "./connectivity.ts"

export interface LiveSocket extends EventTarget {
  send(data: string): void
  close(): void
}

export interface LiveOptions {
  readonly open: () => LiveSocket
  readonly onChanged: (keys: ReadonlyArray<QueryKey>) => void
  readonly onStale: () => void
  readonly report: (signal: Signal) => void
  readonly random?: () => number
}

export const HEARTBEAT_MS = 30_000
const FIRST_RETRY_MS = 1_000
const LAST_RETRY_MS = 30_000

export const retryDelay = (attempt: number, random: () => number) =>
  Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt) * (0.5 + random() / 2)

export const socketUrl = ({ protocol, host }: Pick<Location, "protocol" | "host">) =>
  `${protocol === "https:" ? "wss:" : "ws:"}//${host}${SOCKET_PATH}`

const decodeEnvelope = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ changed: Schema.Array(Schema.Unknown) })),
)
const decodeKey = Schema.decodeUnknownOption(QueryKey)

export const changedKeys = (data: string): Option.Option<ReadonlyArray<QueryKey>> =>
  Option.map(decodeEnvelope(data), ({ changed }) => changed.flatMap((key) => Option.toArray(decodeKey(key))))

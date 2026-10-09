import { type ActionId, Changed } from "@bt/contracts"
import { Schema } from "effect"

const HOUR_MS = 60 * 60 * 1000
export const RECEIPT_TTL_MS = 24 * HOUR_MS
export const PRUNE_EVERY_MS = 6 * HOUR_MS

export interface Stamp {
  readonly caregiverId: string
  readonly now: number
}

export interface Mutation extends Stamp {
  readonly route: string
  readonly actionId: ActionId
  readonly requestHash: string
}

export type CoreResult<A, E> =
  | { readonly ok: true; readonly response: A; readonly changed: Changed }
  | { readonly ok: false; readonly error: E }

export type Outcome<A, E> =
  | { readonly kind: "applied" | "replayed"; readonly response: A; readonly changed: Changed }
  | { readonly kind: "replay-mismatch"; readonly saved: A }
  | { readonly kind: "other-route"; readonly storedRoute: string }
  | { readonly kind: "rejected"; readonly error: E }

type ReceiptRow = { route: string; request_hash: string; response: string; changed: string }

const changedJson = Schema.fromJsonString(Changed)

class Rollback extends Error {}

export const withReceipt = <A, E>(
  storage: DurableObjectStorage,
  mutation: Mutation,
  response: Schema.Codec<A, Schema.Json>,
  core: (sql: SqlStorage) => CoreResult<A, E>,
): Outcome<A, E> => {
  const responseJson = Schema.fromJsonString(response)
  let rejected: { readonly error: E } | undefined
  try {
    return storage.transactionSync((): Outcome<A, E> => {
      const { sql } = storage
      const [receipt] = sql
        .exec<ReceiptRow>(
          "SELECT route, request_hash, response, changed FROM receipts WHERE action_id = ?",
          mutation.actionId,
        )
        .toArray()
      if (receipt !== undefined) {
        if (receipt.route !== mutation.route) return { kind: "other-route", storedRoute: receipt.route }
        const saved = Schema.decodeSync(responseJson)(receipt.response)
        if (receipt.request_hash !== mutation.requestHash) return { kind: "replay-mismatch", saved }
        return { kind: "replayed", response: saved, changed: Schema.decodeSync(changedJson)(receipt.changed) }
      }
      const result = core(sql)
      if (!result.ok) {
        rejected = { error: result.error }
        throw new Rollback()
      }
      sql.exec(
        "INSERT INTO receipts (action_id, route, caregiver_id, request_hash, response, changed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        mutation.actionId,
        mutation.route,
        mutation.caregiverId,
        mutation.requestHash,
        Schema.encodeSync(responseJson)(result.response),
        Schema.encodeSync(changedJson)(result.changed),
        mutation.now,
      )
      return { kind: "applied", response: result.response, changed: result.changed }
    })
  } catch (error) {
    if (error instanceof Rollback && rejected !== undefined) return { kind: "rejected", error: rejected.error }
    throw error
  }
}

export const requestHash = async <A>(
  route: string,
  payload: Schema.Codec<A, Schema.Json>,
  value: A,
): Promise<string> => {
  const body = JSON.stringify(Schema.encodeSync(payload)(value))
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${route}\n${body}`))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const pruneReceipts = (sql: SqlStorage, now: number): number =>
  sql.exec("DELETE FROM receipts WHERE created_at < ?", now - RECEIPT_TTL_MS).rowsWritten

import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type CoreResult,
  type Mutation,
  PRUNE_EVERY_MS,
  pruneReceipts,
  RECEIPT_TTL_MS,
  requestHash,
  withReceipt,
} from "../src/core/receipts.ts"
import { ANDREW, seededHousehold } from "./fixtures.ts"

const NOW = Date.UTC(2090, 0, 1, 12)

const Diaper = Schema.Struct({ id: Schema.String, wet: Schema.Boolean })
type Diaper = typeof Diaper.Type

const caregiverId = (sql: SqlStorage) =>
  sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", ANDREW.email).one().id

const inSeededHousehold = async <R>(run: (storage: DurableObjectStorage) => R) =>
  runInDurableObject(await seededHousehold(), (_instance, state) => {
    state.storage.sql.exec("CREATE TABLE probe_diapers (id TEXT PRIMARY KEY, wet INTEGER NOT NULL) STRICT")
    return run(state.storage)
  })

const mutationIn = (sql: SqlStorage, requestHash = "hash-of-the-first-request"): Mutation => ({
  route: "POST /api/diapers",
  actionId: "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f",
  requestHash,
  caregiverId: caregiverId(sql),
  now: NOW,
})

const logDiaper =
  (diaper: Diaper, calls: string[] = []) =>
  (sql: SqlStorage): CoreResult<Diaper, never> => {
    calls.push(diaper.id)
    sql.exec("INSERT INTO probe_diapers (id, wet) VALUES (?, ?)", diaper.id, diaper.wet ? 1 : 0)
    return { ok: true, response: diaper, changed: [["today"], ["day", "2026-10-08"]] }
  }

const count = (sql: SqlStorage, table: string) => sql.exec<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).one().n

describe("a mutation with a receipt", () => {
  it("applies once, and stores its response and changed keys in the same transaction", async () => {
    const stored = await inSeededHousehold((storage) => {
      const outcome = withReceipt(storage, mutationIn(storage.sql), Diaper, logDiaper({ id: "d1", wet: true }))
      const receipt = storage.sql.exec("SELECT route, request_hash, response, changed, created_at FROM receipts").one()
      return { outcome, receipt, diapers: count(storage.sql, "probe_diapers") }
    })
    expect(stored).toEqual({
      outcome: { kind: "applied", response: { id: "d1", wet: true }, changed: [["today"], ["day", "2026-10-08"]] },
      receipt: {
        route: "POST /api/diapers",
        request_hash: "hash-of-the-first-request",
        response: '{"id":"d1","wet":true}',
        changed: '[["today"],["day","2026-10-08"]]',
        created_at: NOW,
      },
      diapers: 1,
    })
  })

  it("replays the stored response and changed keys for a retry with the same body, and applies nothing", async () => {
    const replay = await inSeededHousehold((storage) => {
      const calls: string[] = []
      withReceipt(storage, mutationIn(storage.sql), Diaper, logDiaper({ id: "d1", wet: true }, calls))
      const outcome = withReceipt(storage, mutationIn(storage.sql), Diaper, logDiaper({ id: "d2", wet: false }, calls))
      return { outcome, calls, diapers: count(storage.sql, "probe_diapers") }
    })
    expect(replay).toEqual({
      outcome: { kind: "replayed", response: { id: "d1", wet: true }, changed: [["today"], ["day", "2026-10-08"]] },
      calls: ["d1"],
      diapers: 1,
    })
  })

  it("answers a retry with edited values with the saved record, for ACTION_REPLAY_MISMATCH, and applies nothing", async () => {
    const replay = await inSeededHousehold((storage) => {
      const calls: string[] = []
      withReceipt(storage, mutationIn(storage.sql), Diaper, logDiaper({ id: "d1", wet: true }, calls))
      const edited = mutationIn(storage.sql, "hash-of-an-edited-request")
      const outcome = withReceipt(storage, edited, Diaper, logDiaper({ id: "d1", wet: false }, calls))
      return { outcome, calls }
    })
    expect(replay).toEqual({ outcome: { kind: "replay-mismatch", saved: { id: "d1", wet: true } }, calls: ["d1"] })
  })

  it("answers an actionId already used on another route with other-route, decoding and applying nothing", async () => {
    const Feed = Schema.Struct({ id: Schema.String, side: Schema.Literals(["left", "right"]) })
    const reused = await inSeededHousehold((storage) => {
      const calls: string[] = []
      withReceipt(storage, mutationIn(storage.sql), Diaper, logDiaper({ id: "d1", wet: true }, calls))
      const elsewhere = { ...mutationIn(storage.sql, "hash-of-a-feed-request"), route: "POST /api/feeds" }
      const outcome = withReceipt(storage, elsewhere, Feed, (): CoreResult<typeof Feed.Type, never> => {
        calls.push("f1")
        return { ok: true, response: { id: "f1", side: "left" }, changed: [["today"]] }
      })
      return { outcome, calls, receipts: count(storage.sql, "receipts") }
    })
    expect(reused).toEqual({
      outcome: { kind: "other-route", storedRoute: "POST /api/diapers" },
      calls: ["d1"],
      receipts: 1,
    })
  })

  it("keeps nothing the core wrote when it rejects, and stores no receipt", async () => {
    const after = await inSeededHousehold((storage) => {
      const outcome = withReceipt(storage, mutationIn(storage.sql), Diaper, (sql): CoreResult<Diaper, string> => {
        sql.exec("INSERT INTO probe_diapers (id, wet) VALUES ('d1', 1)")
        return { ok: false, error: "SEGMENT_OVERLAP" }
      })
      return { outcome, diapers: count(storage.sql, "probe_diapers"), receipts: count(storage.sql, "receipts") }
    })
    expect(after).toEqual({ outcome: { kind: "rejected", error: "SEGMENT_OVERLAP" }, diapers: 0, receipts: 0 })
  })

  it("keeps nothing the core wrote when its receipt can't be stored", async () => {
    const after = await inSeededHousehold((storage) => {
      const stranger = { ...mutationIn(storage.sql), caregiverId: "not-a-caregiver" }
      expect(() => withReceipt(storage, stranger, Diaper, logDiaper({ id: "d1", wet: true }))).toThrow(
        "FOREIGN KEY constraint failed",
      )
      return { diapers: count(storage.sql, "probe_diapers"), receipts: count(storage.sql, "receipts") }
    })
    expect(after).toEqual({ diapers: 0, receipts: 0 })
  })
})

describe("requestHash", () => {
  const NewDiaper = Schema.Struct({ actionId: Schema.String, wet: Schema.Boolean, dirty: Schema.Boolean })
  const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"

  it("is a hex SHA-256 that a retry of the same request matches, whatever order its fields came in", async () => {
    const hash = await requestHash("POST /api/diapers", NewDiaper, { actionId: ACTION_ID, wet: true, dirty: false })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await requestHash("POST /api/diapers", NewDiaper, { dirty: false, wet: true, actionId: ACTION_ID })).toBe(
      hash,
    )
  })

  it("is the SHA-256 of the route, a newline and the payload's JSON, which receipts stored before a deploy rely on", async () => {
    expect(await requestHash("POST /api/diapers", NewDiaper, { actionId: ACTION_ID, wet: true, dirty: false })).toBe(
      "39a01e24054ffb06f5c9e49803f03ad1a9c88d343ba439b42b31fd24a8d997b6",
    )
  })

  it.each([
    ["another route", "POST /api/diapers/d1/restore", { actionId: ACTION_ID, wet: true, dirty: false }],
    ["another value", "POST /api/diapers", { actionId: ACTION_ID, wet: true, dirty: true }],
  ])("differs for %s", async (_label, route, value) => {
    const original = await requestHash("POST /api/diapers", NewDiaper, { actionId: ACTION_ID, wet: true, dirty: false })
    expect(await requestHash(route, NewDiaper, value)).not.toBe(original)
  })
})

describe("pruning receipts", () => {
  const receiptAt = (sql: SqlStorage, actionId: string, createdAt: number) =>
    sql.exec(
      "INSERT INTO receipts (action_id, caregiver_id, request_hash, response, changed, created_at) VALUES (?, ?, 'h', '{}', '[]', ?)",
      actionId,
      caregiverId(sql),
      createdAt,
    )

  const remaining = (sql: SqlStorage) =>
    sql
      .exec<{ action_id: string }>("SELECT action_id FROM receipts ORDER BY action_id")
      .toArray()
      .map(({ action_id }) => action_id)

  it("deletes receipts older than 24 h and keeps the rest", async () => {
    const kept = await inSeededHousehold((storage) => {
      receiptAt(storage.sql, "older", NOW - RECEIPT_TTL_MS - 1)
      receiptAt(storage.sql, "exactly-24-h", NOW - RECEIPT_TTL_MS)
      receiptAt(storage.sql, "newer", NOW - 1)
      return { deleted: pruneReceipts(storage.sql, NOW), kept: remaining(storage.sql) }
    })
    expect(kept).toEqual({ deleted: 1, kept: ["exactly-24-h", "newer"] })
  })

  describe("on the alarm, with the clock pinned ahead of real time so it only fires when a test runs it", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("is due 6 h after a household first starts", async () => {
      const household = await seededHousehold()
      expect(await runInDurableObject(household, (_instance, state) => state.storage.getAlarm())).toBe(
        NOW + PRUNE_EVERY_MS,
      )
    })

    it("prunes, then sets itself for 6 h later", async () => {
      const household = await seededHousehold()
      await runInDurableObject(household, (_instance, state) => {
        receiptAt(state.storage.sql, "older", NOW - RECEIPT_TTL_MS - 1)
        receiptAt(state.storage.sql, "newer", NOW - 1)
      })
      expect(await runDurableObjectAlarm(household)).toBe(true)
      const after = await runInDurableObject(household, async (_instance, state) => ({
        kept: remaining(state.storage.sql),
        next: await state.storage.getAlarm(),
      }))
      expect(after).toEqual({ kept: ["newer"], next: NOW + PRUNE_EVERY_MS })
    })
  })
})

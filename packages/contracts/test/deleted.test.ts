import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  Deleted,
  DeletedGroup,
  type Diaper,
  type Feed,
  type Measurement,
  RECENTLY_DELETED_DAYS,
  type Sleep,
} from "../src/index.ts"

const MINUTE_MS = 60_000
const AT = Date.UTC(2026, 9, 12, 14, 30)
const DELETED_AT = AT + 30 * MINUTE_MS

const FEED: Feed = {
  id: "feed-1",
  status: "completed",
  startedAt: AT,
  endedAt: AT + 15 * MINUTE_MS,
  segments: [{ id: "segment-1", side: "left", startedAt: AT, endedAt: AT + 15 * MINUTE_MS }],
  portions: [],
  version: 3,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-2",
  updatedAt: DELETED_AT,
  deletedAt: DELETED_AT,
}

const DIAPER: Diaper = {
  id: "diaper-1",
  occurredAt: AT - 60 * MINUTE_MS,
  wet: true,
  dirty: false,
  version: 2,
  createdBy: "caregiver-2",
  createdAt: AT,
  updatedBy: "caregiver-2",
  updatedAt: DELETED_AT,
  deletedAt: DELETED_AT,
}

const MEASUREMENT: Measurement = {
  id: "measurement-1",
  measuredAt: AT - 120 * MINUTE_MS,
  weightG: 4210.5,
  lengthCm: null,
  headCm: 37.5,
  version: 2,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-1",
  updatedAt: DELETED_AT,
  deletedAt: DELETED_AT,
}

const SLEEP: Sleep = {
  id: "sleep-1",
  kind: "night",
  startedAt: AT - 300 * MINUTE_MS,
  endedAt: AT - 180 * MINUTE_MS,
  version: 2,
  createdBy: "caregiver-2",
  createdAt: AT,
  updatedBy: "caregiver-1",
  updatedAt: DELETED_AT,
  deletedAt: DELETED_AT,
}

const DELETED = { feeds: [FEED], diapers: [DIAPER], sleeps: [SLEEP], measurements: [MEASUREMENT] }

const decodes = (input: Schema.Json) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.toCodecJson(Deleted))(input))

describe("the household's recently deleted entries", () => {
  it("hold every deleted feed, diaper, sleep and measurement, each as it was when deleted", () => {
    expect(decodes(DELETED)).toBe(true)
  })

  it("still read when a later version adds a kind, as M3.3's doses will", () => {
    expect(decodes({ ...DELETED, doses: [] })).toBe(true)
  })

  it.each([
    ["feeds that are null", { feeds: null }],
    ["diapers that are null", { diapers: null }],
    ["sleeps that are null", { sleeps: null }],
    ["measurements that are null", { measurements: null }],
  ])("refuse %s", (_label, change) => {
    expect(decodes({ ...DELETED, ...change })).toBe(false)
  })

  it("reach back 30 days", () => {
    expect(RECENTLY_DELETED_DAYS).toBe(30)
  })

  it("are read with GET /deleted, which takes nothing", () => {
    const { method, path } = DeletedGroup.endpoints.deleted
    expect(`${method} ${path}`).toBe("GET /deleted")
  })
})

import type { BottlePortion, Instant, Interval, NursingSegment } from "../../src/index.ts"

interface ClosedSegment extends NursingSegment {
  readonly endedAt: Instant
}

const at = (iso: string) => Date.parse(iso)

export const AC23_DAY_LENGTHS = [
  { zone: "America/Vancouver", date: "2026-03-08", hours: 23 },
  { zone: "America/Vancouver", date: "2025-11-02", hours: 25 },
  { zone: "Europe/London", date: "2026-03-29", hours: 23 },
  { zone: "Europe/London", date: "2026-10-25", hours: 25 },
]

export const AC3_MIXED_BOTTLE: BottlePortion = {
  occurredAt: at("2026-10-06T18:00:00Z"),
  breastMilkMl: 40,
  formulaMl: 20,
}

const AC4_LEFT: ClosedSegment = {
  side: "left",
  startedAt: at("2026-10-07T06:50:00Z"),
  endedAt: at("2026-10-07T07:05:00Z"),
}

const AC4_RIGHT: ClosedSegment = {
  side: "right",
  startedAt: at("2026-10-07T07:05:00Z"),
  endedAt: at("2026-10-07T07:20:00Z"),
}

export const AC4_MIDNIGHT_FEED = {
  segments: [AC4_LEFT, AC4_RIGHT],
  portions: [
    { occurredAt: at("2026-10-07T07:20:00Z"), breastMilkMl: 50, formulaMl: 0 },
    { occurredAt: at("2026-10-07T07:25:00Z"), breastMilkMl: 0, formulaMl: 50 },
  ],
} as const

export const AC21_DST_SEGMENTS = [
  {
    label: "Vancouver, clocks go back: 01:50 PDT to 01:10 PST",
    startedAt: at("2025-11-02T08:50:00Z"),
    endedAt: at("2025-11-02T09:10:00Z"),
  },
  {
    label: "Vancouver, clocks go forward: 01:50 PST to 03:10 PDT",
    startedAt: at("2026-03-08T09:50:00Z"),
    endedAt: at("2026-03-08T10:10:00Z"),
  },
  {
    label: "London, clocks go back: 01:50 BST to 01:10 GMT",
    startedAt: at("2026-10-25T00:50:00Z"),
    endedAt: at("2026-10-25T01:10:00Z"),
  },
  {
    label: "London, clocks go forward: 00:50 GMT to 02:10 BST",
    startedAt: at("2026-03-29T00:50:00Z"),
    endedAt: at("2026-03-29T01:10:00Z"),
  },
]

export const AC12_MIDNIGHT_SLEEP: Interval = { start: at("2026-10-07T06:30:00Z"), end: at("2026-10-07T08:00:00Z") }

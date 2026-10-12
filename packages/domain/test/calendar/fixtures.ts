import type { CalendarBlock, GridScale, Side } from "../../src/index.ts"
import { zonedDayBounds } from "../../src/index.ts"
import { VANCOUVER } from "../fixtures/zones.ts"

export const MINUTE = 60_000
export const SCALE: GridScale = { stepMs: 5 * MINUTE, minBlockSteps: 4, pointSteps: 5 }
export const DATE = "2026-10-09"
export const BOUNDS = zonedDayBounds(DATE, VANCOUVER)
export const NEXT_BOUNDS = zonedDayBounds("2026-10-10", VANCOUVER)
export const AFTERNOON = BOUNDS.start + 16 * 60 * MINUTE

export const atMinute = (minutes: number) => BOUNDS.start + minutes * MINUTE

export const side = (kind: Side, from: number, to: number | null) => ({
  kind,
  startedAt: atMinute(from),
  endedAt: to === null ? null : atMinute(to),
})

export const block = (id: string, bands: CalendarBlock<Side>["bands"]): CalendarBlock<Side> => ({
  id,
  startedAt: Math.min(...bands.map(({ startedAt }) => startedAt)),
  endedAt: bands.some(({ endedAt }) => endedAt === null) ? null : Math.max(...bands.map(({ endedAt }) => endedAt ?? 0)),
  bands,
})

export const dayOf = (blocks: ReadonlyArray<CalendarBlock<Side>>, now = AFTERNOON) => ({
  date: DATE,
  zone: VANCOUVER,
  bounds: BOUNDS,
  now,
  blocks,
  points: [],
})

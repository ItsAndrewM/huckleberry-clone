import { describe, expect, it } from "vitest"
import { dayModel } from "../src/features/history/day-model.ts"
import { blockText, clusterName, entryName, markerText, shortMinutes } from "../src/features/history/entry-labels.ts"
import { markersOf } from "../src/features/history/grid-markers.ts"
import {
  BOTH,
  BOTTLE,
  DISPLAY,
  dayWith,
  local,
  NOW_ON_DAY,
  NURSED,
  PAUSED,
  PEE,
  POO,
  RUNNING,
} from "./history-fixtures.ts"
import { ZONE } from "./today-fixtures.ts"

describe("shortMinutes", () => {
  it("keeps a block's label short", () => {
    expect([0, 30, 60, 14 * 60, 3600, 3900].map(shortMinutes)).toEqual(["0m", "<1m", "1m", "14m", "1h", "1h 5m"])
  })
})

describe("a block's label", () => {
  it("names each side's minutes and any bottle given during a finished feed, and nothing after them", () => {
    expect(blockText(NURSED, "ml", NOW_ON_DAY)).toBe("Nursing 14m L · 9m R")
    expect(blockText(PAUSED, "ml", NOW_ON_DAY)).toBe("Nursing 10m L · 10m R · 60 mL")
  })

  it("ends with now while a side is running", () => {
    expect(blockText(RUNNING, "ml", NOW_ON_DAY)).toBe("Nursing 50m L · now")
  })

  it("says just Nursing · now for a side that started this moment", () => {
    expect(blockText(RUNNING, "ml", RUNNING.startedAt)).toBe("Nursing · now")
  })

  it("ends with paused while the feed waits with every side ended", () => {
    const waiting = { ...NURSED, status: "active" as const, endedAt: null }
    expect(blockText(waiting, "ml", NOW_ON_DAY)).toBe("Nursing 14m L · 9m R · paused")
  })
})

describe("a marker's label", () => {
  it("uses the Diaper sheet's own words, and a bottle's amount in the household's unit", () => {
    expect(markerText({ kind: "diaper", diaper: PEE }, "ml", NOW_ON_DAY)).toBe("Pee")
    expect(markerText({ kind: "diaper", diaper: POO }, "ml", NOW_ON_DAY)).toBe("Poo")
    expect(markerText({ kind: "diaper", diaper: BOTH }, "ml", NOW_ON_DAY)).toBe("Both")
    expect(markerText({ kind: "feed", feed: BOTTLE }, "fl_oz", NOW_ON_DAY)).toBe("3.0 fl oz")
  })
})

describe("what a screen reader hears for an entry", () => {
  it("names its kind, time and details", () => {
    expect(entryName({ kind: "diaper", diaper: BOTH }, DISPLAY, NOW_ON_DAY)).toBe("Diaper at 5:30 AM: Pee and poo")
    expect(entryName({ kind: "feed", feed: PAUSED }, DISPLAY, NOW_ON_DAY)).toBe(
      "Nursing and bottle at 3:00 AM: Left 10 min, Right 10 min, 60 mL",
    )
    expect(entryName({ kind: "feed", feed: RUNNING }, DISPLAY, NOW_ON_DAY)).toBe(
      "Nursing at 8:40 AM: in progress, Left 50 min",
    )
  })

  it("says when a feed is paused", () => {
    const paused = {
      ...RUNNING,
      segments: [{ id: "p", side: "left" as const, startedAt: RUNNING.startedAt, endedAt: local("09:20") }],
    }
    expect(entryName({ kind: "feed", feed: paused }, DISPLAY, NOW_ON_DAY)).toBe(
      "Nursing at 8:40 AM: paused, Left 40 min",
    )
  })

  it("names a nursing feed with nothing to report without a trailing colon", () => {
    const instant = {
      ...NURSED,
      endedAt: local("01:05"),
      segments: [{ id: "zero-0", side: "left" as const, startedAt: local("01:05"), endedAt: local("01:05") }],
    }
    expect(entryName({ kind: "feed", feed: instant }, DISPLAY, NOW_ON_DAY)).toBe("Nursing at 1:05 AM")
  })

  it("counts the entries gathered in one marker, from the first one's time", () => {
    expect(clusterName(2, PEE.occurredAt, DISPLAY)).toBe("2 entries from 2:10 AM")
  })
})

describe("markersOf", () => {
  it("labels a single entry by its kind, and a gathered marker by its count", () => {
    const markers = markersOf(dayModel(dayWith(), ZONE, NOW_ON_DAY), DISPLAY, NOW_ON_DAY)
    expect(markers.map(({ kind, text, ids }) => [kind, text, ids.length])).toEqual([
      ["several", "2 entries", 2],
      ["bottle", "90 mL", 1],
      ["diaper", "Both", 1],
    ])
    expect(markers[0]?.name).toBe("2 entries from 2:10 AM")
  })

  it("keys each marker by the ids it holds, and places it at its cluster's step", () => {
    const markers = markersOf(dayModel(dayWith(), ZONE, NOW_ON_DAY), DISPLAY, NOW_ON_DAY)
    expect(markers.map(({ key, top }) => [key, top])).toEqual([
      [`${PEE.id},${POO.id}`, 26],
      [BOTTLE.id, 48],
      [BOTH.id, 66],
    ])
  })
})

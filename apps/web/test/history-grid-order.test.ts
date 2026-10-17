import { describe, expect, it } from "vitest"
import { dayModel } from "../src/features/history/day-model.ts"
import { gridItems } from "../src/features/history/grid-order.ts"
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
import { dosedAt, sleptAt, ZONE } from "./today-fixtures.ts"

const NIGHT = sleptAt(local("20:30", "2026-10-08"), { id: "night", kind: "night", endedAt: local("00:50") })
const NAP = sleptAt(local("03:30"), { id: "nap", endedAt: local("03:55") })
const DOSE = dosedAt(local("06:00"), { id: "dose" })

describe("gridItems", () => {
  it("lists a day's entries by the time each began, whatever its kind", () => {
    const model = dayModel(dayWith({ sleeps: [NAP, NIGHT], doses: [DOSE] }), ZONE, NOW_ON_DAY)
    expect(gridItems(model, DISPLAY, NOW_ON_DAY).map(({ key }) => key)).toEqual([
      "night",
      NURSED.id,
      `${PEE.id},${POO.id}`,
      PAUSED.id,
      "nap",
      BOTTLE.id,
      BOTH.id,
      "dose",
      RUNNING.id,
    ])
  })

  it("keeps each entry's own kind, so the grid draws it in its own column", () => {
    const model = dayModel(dayWith({ sleeps: [NAP], doses: [DOSE] }), ZONE, NOW_ON_DAY)
    const kinds = new Map(gridItems(model, DISPLAY, NOW_ON_DAY).map(({ key, kind }) => [key, kind]))
    expect([kinds.get("nap"), kinds.get(NURSED.id), kinds.get(BOTTLE.id), kinds.get("dose")]).toEqual([
      "sleep",
      "feed",
      "marker",
      "marker",
    ])
  })
})

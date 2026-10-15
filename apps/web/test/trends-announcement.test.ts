import { describe, expect, it } from "vitest"
import { TRENDS_METRICS } from "../src/features/trends/metrics.ts"
import { barAnnouncement } from "../src/features/trends/trends-numbers.ts"
import { NO_TOTALS } from "./today-fixtures.ts"
import { LOCALE } from "./trends-fixtures.ts"

const metric = (id: string) => {
  const found = TRENDS_METRICS.find((one) => one.id === id)
  if (found === undefined) throw new Error(`No ${id} metric`)
  return found
}

const DIAPERS = { ...NO_TOTALS, diapers: 7, wetDiapers: 5, dirtyDiapers: 3 }

describe("barAnnouncement", () => {
  it("names the chart and the day, then its numbers, with commas between them", () => {
    expect(
      barAnnouncement(metric("diapers"), { date: "2026-10-06", status: "counted", totals: DIAPERS }, "ml", LOCALE),
    ).toBe("Diapers, Tue, Oct 6: 7, 5 pee, 3 poo")
  })

  it("says a day with nothing logged has no entries", () => {
    expect(
      barAnnouncement(metric("diapers"), { date: "2026-10-04", status: "no-entries", totals: NO_TOTALS }, "ml", LOCALE),
    ).toBe("Diapers, Sun, Oct 4: No entries")
  })
})

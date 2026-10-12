import { describe, expect, it } from "vitest"
import { entryDetails } from "../src/features/history/entry-details.ts"
import { BOTH, BOTTLE, DISPLAY, local, NOW_ON_DAY, NURSED, PAUSED, RUNNING } from "./history-fixtures.ts"
import { ANDREW, feedAt } from "./today-fixtures.ts"

const feed = (entry: typeof NURSED) => entryDetails({ kind: "feed", feed: entry }, DISPLAY, NOW_ON_DAY)

describe("entryDetails", () => {
  it("gives a feed's times, sides, pause and bottle, and who logged it", () => {
    expect(feed(PAUSED)).toEqual({
      id: PAUSED.id,
      title: "Nursing and bottle",
      when: expect.stringMatching(/^Fri, Oct 9, 3:00\s–\s3:45\sAM$/u),
      lines: ["Left 10 min · Right 10 min", "Paused 20 min", "Bottle 60 mL breast milk"],
      by: "Logged by Emily",
    })
  })

  it("leaves out a pause that didn't happen", () => {
    expect(feed(NURSED).lines).toEqual(["Left 14 min · Right 9 min"])
  })

  it("shows no pause for a switch that lands between whole seconds", () => {
    const switched = {
      ...NURSED,
      endedAt: local("01:28") + 1800,
      segments: [
        { id: "ms-0", side: "left" as const, startedAt: local("01:05"), endedAt: local("01:19") + 900 },
        { id: "ms-1", side: "right" as const, startedAt: local("01:19") + 900, endedAt: local("01:28") + 1800 },
      ],
    }
    expect(feed(switched).lines).toEqual(["Left 14 min · Right 9 min"])
  })

  it("doesn't count a bottle given before the first side as a pause", () => {
    const bottleFirst = {
      ...NURSED,
      portions: [{ id: "early", occurredAt: local("00:55"), breastMilkMl: 60, formulaMl: 0 }],
    }
    expect(feed(bottleFirst).lines).toEqual(["Left 14 min · Right 9 min", "Bottle 60 mL breast milk"])
  })

  it("gives a bottle on its own its time and what was in it", () => {
    expect(feed(BOTTLE)).toMatchObject({
      title: "Bottle",
      when: "Fri, Oct 9, 4:00 AM",
      lines: ["Bottle 90 mL formula"],
    })
  })

  it("splits a bottle of both milks", () => {
    const mixed = { ...BOTTLE, portions: [{ id: "mix", occurredAt: local("04:00"), breastMilkMl: 40, formulaMl: 20 }] }
    expect(feed(mixed).lines).toEqual(["Bottle 60 mL: breast milk 40 mL · formula 20 mL"])
  })

  it("gives a bottle in fl oz for a household that measures in them", () => {
    const ounces = { ...DISPLAY, volume: "fl_oz" as const }
    const details = (entry: typeof NURSED) => entryDetails({ kind: "feed", feed: entry }, ounces, NOW_ON_DAY).lines
    const mixed = { ...BOTTLE, portions: [{ id: "mix", occurredAt: local("04:00"), breastMilkMl: 40, formulaMl: 20 }] }
    expect(details(PAUSED)).toEqual(["Left 10 min · Right 10 min", "Paused 20 min", "Bottle 2.0 fl oz breast milk"])
    expect(details(BOTTLE)).toEqual(["Bottle 3.0 fl oz formula"])
    expect(details(mixed)).toEqual(["Bottle 2.0 fl oz: breast milk 1.4 fl oz · formula 0.7 fl oz"])
  })

  it("dates both ends of a feed that crosses midnight", () => {
    const crossing = {
      ...feedAt(local("23:40", "2026-10-08")),
      endedAt: local("00:15"),
      segments: [
        { id: "x-0", side: "left" as const, startedAt: local("23:40", "2026-10-08"), endedAt: local("00:15") },
      ],
    }
    expect(feed(crossing).when).toMatch(/^Thu, Oct 8, 11:40\sPM\s–\sFri, Oct 9, 12:15\sAM$/u)
  })

  it("says a feed is still going, up to now", () => {
    expect(feed(RUNNING)).toMatchObject({
      when: expect.stringMatching(/^Fri, Oct 9, 9:10\s–\s9:30\sAM$/u),
      lines: ["In progress", "Left 20 min"],
    })
  })

  it("says a feed is paused", () => {
    const paused = {
      ...RUNNING,
      segments: [{ id: "p", side: "left" as const, startedAt: RUNNING.startedAt, endedAt: local("09:20") }],
    }
    expect(feed(paused).lines).toEqual(["Paused", "Left 10 min"])
  })

  it("gives a diaper its time and kind", () => {
    expect(entryDetails({ kind: "diaper", diaper: BOTH }, DISPLAY, NOW_ON_DAY)).toEqual({
      id: BOTH.id,
      title: "Diaper",
      when: "Fri, Oct 9, 5:30 AM",
      lines: ["Pee and poo"],
      by: "Logged by Emily",
    })
  })

  it("names nobody when the caregiver isn't in the household any more", () => {
    expect(entryDetails({ kind: "diaper", diaper: { ...BOTH, createdBy: "gone" } }, DISPLAY, NOW_ON_DAY).by).toBe("")
    expect(feed({ ...NURSED, createdBy: ANDREW }).by).toBe("Logged by Andrew")
  })
})

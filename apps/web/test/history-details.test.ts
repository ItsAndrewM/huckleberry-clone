import { describe, expect, it } from "vitest"
import { entryDetails } from "../src/features/history/entry-details.ts"
import { BOTH, BOTTLE, DISPLAY, local, NOW_ON_DAY, NURSED, PAUSED, RUNNING } from "./history-fixtures.ts"
import { ANDREW } from "./today-fixtures.ts"

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

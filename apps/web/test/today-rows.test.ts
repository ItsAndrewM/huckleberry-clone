import { describe, expect, it } from "vitest"
import { pendingId } from "../src/api/pending.ts"
import type { Display } from "../src/features/today/display.ts"
import { feedParts, feedTitle } from "../src/features/today/feed-parts.ts"
import { recentRows } from "../src/features/today/recent-rows.ts"
import { totalsRows } from "../src/features/today/totals-rows.ts"
import { ANDREW, diaperAt, EMILY, feedAt, MINUTE, NO_TOTALS, NOW, nursedFor, sleptAt, ZONE } from "./today-fixtures.ts"

const TWO_TEN = Date.UTC(2026, 9, 9, 9, 10)
const BOTTLE = { id: "bottle", occurredAt: TWO_TEN, breastMilkMl: 40, formulaMl: 20 }
const NURSED = nursedFor(nursedFor(feedAt(TWO_TEN), "left", 12), "right", 8)

const DISPLAY: Display = {
  timeZone: ZONE,
  volume: "ml",
  locale: "en-US",
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
}

describe("a feed's title and parts", () => {
  it("names a feed by what it holds", () => {
    expect(feedTitle(NURSED)).toBe("Nursing")
    expect(feedTitle(feedAt(TWO_TEN, { portions: [BOTTLE] }))).toBe("Bottle")
    expect(feedTitle({ ...NURSED, portions: [BOTTLE] })).toBe("Nursing and bottle")
  })

  it("lists each side nursed and the bottles' total, in the household's volume unit", () => {
    const feed = { ...NURSED, portions: [BOTTLE] }
    expect(feedParts(feed, "ml", NOW)).toEqual(["Left 12 min", "Right 8 min", "60 mL"])
    expect(feedParts(feed, "fl_oz", NOW)).toEqual(["Left 12 min", "Right 8 min", "2.0 fl oz"])
  })

  it("leaves out a side that wasn't nursed", () => {
    expect(feedParts(nursedFor(feedAt(TWO_TEN), "right", 8), "ml", NOW)).toEqual(["Right 8 min"])
  })
})

describe("totalsRows", () => {
  const TOTALS = {
    ...NO_TOTALS,
    feedsStarted: 6,
    leftSeconds: 42 * 60,
    rightSeconds: 38 * 60,
    nursingSeconds: 80 * 60,
    breastMilkMl: 120,
    formulaMl: 60,
    bottleMl: 180,
    diapers: 5,
    wetDiapers: 4,
    dirtyDiapers: 2,
    sleepsStarted: 3,
    sleepSeconds: 680 * 60,
    napSeconds: 170 * 60,
    nightSeconds: 510 * 60,
    longestSleepSeconds: 390 * 60,
  }

  it("totals feeds, nursing, bottles, diapers and sleep, each with its parts", () => {
    expect(totalsRows(TOTALS, "ml")).toEqual([
      { label: "Feeds started", value: "6", detail: [] },
      { label: "Nursing", value: "1 h 20 min", detail: ["Left 42 min", "Right 38 min"] },
      { label: "Bottles", value: "180 mL", detail: ["Breast milk 120 mL", "Formula 60 mL"] },
      { label: "Diapers", value: "5", detail: ["4 pee", "2 poo"] },
      { label: "Sleep", value: "11 h 20 min", detail: ["Naps 2 h 50 min", "Night 8 h 30 min"] },
    ])
  })

  it("leaves out naps or night when she had none", () => {
    expect(totalsRows({ ...TOTALS, sleepSeconds: 170 * 60, nightSeconds: 0 }, "ml")[4]?.detail).toEqual([
      "Naps 2 h 50 min",
    ])
  })

  it("shows bottles in fl oz when the household uses them", () => {
    expect(totalsRows(TOTALS, "fl_oz")[2]).toEqual({
      label: "Bottles",
      value: "6.1 fl oz",
      detail: ["Breast milk 4.1 fl oz", "Formula 2.0 fl oz"],
    })
  })

  it("shows zeros, with no parts, before anything is logged", () => {
    expect(totalsRows(NO_TOTALS, "ml").map(({ value, detail }) => [value, detail])).toEqual([
      ["0", []],
      ["0 min", []],
      ["0 mL", []],
      ["0", []],
      ["0 min", []],
    ])
  })
})

describe("recentRows", () => {
  it("shows a feed at its start, in the household's zone, with its parts and who logged it", () => {
    const rows = recentRows([{ kind: "feed", feed: { ...NURSED, portions: [BOTTLE] } }], DISPLAY, NOW)
    expect(rows.map((row) => ({ ...row, time: row.time.replace(/\s/gu, " ") }))).toEqual([
      {
        id: NURSED.id,
        kind: "nursing",
        at: TWO_TEN,
        time: "2:10 AM",
        title: "Nursing and bottle",
        detail: ["Left 12 min", "Right 8 min", "60 mL"],
        by: "Andrew",
        saving: false,
        opens: "editFeed",
      },
    ])
  })

  it("says whether a feed that hasn't finished is running or paused", () => {
    const paused = { ...NURSED, status: "active" as const, endedAt: null }
    const open = { id: "open", side: "left" as const, startedAt: NOW - 5 * MINUTE, endedAt: null }
    const runningFeed = { ...paused, segments: [...paused.segments, open] }
    const details = recentRows(
      [
        { kind: "feed", feed: runningFeed },
        { kind: "feed", feed: paused },
      ],
      DISPLAY,
      NOW,
    ).map((row) => row.detail)
    expect(details).toEqual([
      ["In progress", "Left 17 min", "Right 8 min"],
      ["Paused", "Left 12 min", "Right 8 min"],
    ])
  })

  it("opens a diaper or a finished feed in its edit sheet, a feed still going in the Nursing sheet, and a saving one in nothing", () => {
    const going = { ...NURSED, id: "going", status: "active" as const, endedAt: null }
    const saving = { ...NURSED, id: pendingId("action-1") }
    const rows = recentRows(
      [
        { kind: "diaper", diaper: diaperAt(TWO_TEN) },
        { kind: "feed", feed: NURSED },
        { kind: "feed", feed: going },
        { kind: "feed", feed: saving },
        { kind: "diaper", diaper: diaperAt(TWO_TEN, { id: pendingId("action-2") }) },
      ],
      DISPLAY,
      NOW,
    )
    expect(rows.map(({ opens }) => opens)).toEqual(["editDiaper", "editFeed", "nursing", null, null])
  })

  it("shows a diaper as pee, poo or both, with who changed it", () => {
    const rows = recentRows(
      [
        { kind: "diaper", diaper: diaperAt(TWO_TEN) },
        { kind: "diaper", diaper: diaperAt(TWO_TEN, { wet: false, dirty: true }) },
        { kind: "diaper", diaper: diaperAt(TWO_TEN, { dirty: true }) },
      ],
      DISPLAY,
      NOW,
    )
    expect(rows.map(({ title, detail, by }) => [title, detail, by])).toEqual([
      ["Diaper", ["Pee"], "Emily"],
      ["Diaper", ["Poo"], "Emily"],
      ["Diaper", ["Pee and poo"], "Emily"],
    ])
  })

  it("marks a feed of bottles only as a bottle, and a diaper as a diaper", () => {
    const rows = recentRows(
      [
        { kind: "feed", feed: feedAt(TWO_TEN, { portions: [BOTTLE] }) },
        { kind: "diaper", diaper: diaperAt(TWO_TEN) },
      ],
      DISPLAY,
      NOW,
    )
    expect(rows.map((row) => row.kind)).toEqual(["bottle", "diaper"])
  })

  it("names no one for a caregiver the household doesn't list", () => {
    const [row] = recentRows([{ kind: "diaper", diaper: diaperAt(TWO_TEN, { createdBy: "gone" }) }], DISPLAY, NOW)
    expect(row?.by).toBe("")
  })

  it("says a running feed is saving while a bottle added to it hasn't been answered", () => {
    const topUp = { ...BOTTLE, id: pendingId("action-1") }
    const running = { ...NURSED, status: "active" as const, endedAt: null }
    const rows = recentRows(
      [
        { kind: "feed", feed: { ...running, portions: [topUp] } },
        { kind: "feed", feed: { ...running, id: "settled", portions: [BOTTLE] } },
      ],
      DISPLAY,
      NOW,
    )
    expect(rows.map(({ id, saving }) => [id, saving])).toEqual([
      [NURSED.id, true],
      ["settled", false],
    ])
  })

  it("shows a sleep at its start as a nap or a night, with how long she slept, when she woke and who logged it", () => {
    const nap = sleptAt(TWO_TEN, { endedAt: TWO_TEN + 80 * MINUTE })
    const rows = recentRows([{ kind: "sleep", sleep: nap }], DISPLAY, NOW)
    const plain = (text: string) => text.replace(/\s/gu, " ")
    expect(rows.map((row) => ({ ...row, time: plain(row.time), detail: row.detail.map(plain) }))).toEqual([
      {
        id: nap.id,
        kind: "sleep",
        at: TWO_TEN,
        time: "2:10 AM",
        title: "Nap",
        detail: ["1 h 20 min", "Woke 3:30 AM"],
        by: "Andrew",
        saving: false,
        opens: null,
      },
    ])
  })

  it("says she's asleep now while a sleep runs, counting up to now", () => {
    const night = sleptAt(NOW - 42 * MINUTE, { kind: "night", endedAt: null })
    const [row] = recentRows([{ kind: "sleep", sleep: night }], DISPLAY, NOW)
    expect([row?.title, row?.detail]).toEqual(["Night", ["Asleep now", "42 min"]])
  })

  it("says a feed or a diaper is saving until the household gives it an id of its own", () => {
    const rows = recentRows(
      [
        { kind: "feed", feed: feedAt(TWO_TEN, { id: pendingId("action-2") }) },
        { kind: "diaper", diaper: diaperAt(TWO_TEN, { id: pendingId("action-3") }) },
        { kind: "sleep", sleep: sleptAt(TWO_TEN, { id: pendingId("action-4") }) },
        { kind: "diaper", diaper: diaperAt(TWO_TEN) },
        { kind: "sleep", sleep: sleptAt(TWO_TEN) },
      ],
      DISPLAY,
      NOW,
    )
    expect(rows.map((row) => row.saving)).toEqual([true, true, true, false, false])
  })
})

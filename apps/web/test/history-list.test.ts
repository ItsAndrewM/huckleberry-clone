import type { Sleep } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { pendingId } from "../src/api/pending.ts"
import { hiddenIn } from "../src/features/history/history-kinds.ts"
import { listNote, listRows } from "../src/features/history/list-rows.ts"
import { logTimeOn } from "../src/features/history/log-time.ts"
import type { RecentRow } from "../src/features/today/recent-rows.ts"
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
  WEIGHED,
} from "./history-fixtures.ts"
import { ANDREW, diaperAt, dosedAt, feedAt, nursedFor, sleptAt, supplementOf } from "./today-fixtures.ts"

const LOS_ANGELES = "America/Los_Angeles"
const NONE = hiddenIn(undefined)

const spaced = (text: string) => text.replace(/\s/gu, " ")

const shown = (rows: ReadonlyArray<RecentRow>) =>
  rows.map(({ title, time, detail, by }) => spaced(`${time} ${title}: ${detail.join(", ")} (${by})`))

const DOSE = dosedAt(local("02:15"), { id: "dose-1" })
const WITH_VITAMIN_D = { ...DISPLAY, supplements: [supplementOf()] }

const FROM_YESTERDAY = nursedFor(feedAt(local("23:40", "2026-10-08")), "left", 35)
const INTO_TOMORROW = nursedFor(feedAt(local("23:50")), "right", 20)

const NAP = sleptAt(local("06:15"), { endedAt: local("07:05") })
const NIGHT = sleptAt(local("19:45", "2026-10-08"), { kind: "night", endedAt: local("05:10") })

const sleptDay = (...sleeps: ReadonlyArray<Sleep>) => dayWith({ feeds: [], diapers: [], sleeps })

describe("listRows", () => {
  it("lists every feed and diaper earliest first, as Today's rows read, with a finished feed's span", () => {
    expect(shown(listRows(dayWith(), DISPLAY, NOW_ON_DAY, NONE))).toEqual([
      "1:05 – 1:28 AM Nursing: Left 14 min, Right 9 min (Andrew)",
      "2:10 AM Diaper: Pee (Emily)",
      "2:20 AM Diaper: Poo (Andrew)",
      "3:00 – 3:45 AM Nursing and bottle: Left 10 min, Right 10 min, 60 mL (Emily)",
      "4:00 AM Bottle: 90 mL (Andrew)",
      "5:30 AM Diaper: Pee and poo (Emily)",
      "8:40 AM Nursing: In progress, Left 50 min (Emily)",
    ])
  })

  it("opens the Nursing sheet's kind for a feed still going, as Today does", () => {
    const rows = listRows(dayWith(), DISPLAY, NOW_ON_DAY, NONE)
    expect(rows.find(({ id }) => id === RUNNING.id)?.opens).toBe("nursing")
    expect(rows.find(({ id }) => id === NURSED.id)?.opens).toBe("editFeed")
    expect(rows.find(({ id }) => id === PEE.id)?.opens).toBe("editDiaper")
  })

  it("names the other day where a span crosses midnight, and a running feed's start before it", () => {
    const stillGoing = { ...RUNNING, startedAt: local("23:55", "2026-10-08") }
    const day = dayWith({ feeds: [FROM_YESTERDAY, stillGoing, INTO_TOMORROW], diapers: [] })
    expect(listRows(day, DISPLAY, NOW_ON_DAY, NONE).map(({ time }) => spaced(time))).toEqual([
      "Thu 11:40 PM – 12:15 AM",
      "Thu 11:55 PM",
      "11:50 PM – Sat 12:10 AM",
    ])
  })

  it("leaves out the kinds the chips hide", () => {
    expect(shown(listRows(dayWith(), DISPLAY, NOW_ON_DAY, hiddenIn("feeds")))).toEqual([
      "2:10 AM Diaper: Pee (Emily)",
      "2:20 AM Diaper: Poo (Andrew)",
      "5:30 AM Diaper: Pee and poo (Emily)",
    ])
    expect(listRows(dayWith(), DISPLAY, NOW_ON_DAY, hiddenIn("feeds,diapers"))).toEqual([])
  })

  it("keeps an entry still being saved from opening, as Today does", () => {
    const saving = diaperAt(local("07:00"), { id: pendingId("action-1"), createdBy: ANDREW })
    const [row] = listRows(dayWith({ feeds: [], diapers: [saving] }), DISPLAY, NOW_ON_DAY, NONE)
    expect(row).toMatchObject({ saving: true, opens: null })
  })

  it("lists a dose by its time among the feeds and diapers, read as Today's row reads it, and opens its edit sheet", () => {
    const rows = listRows(dayWith({ doses: [DOSE] }), WITH_VITAMIN_D, NOW_ON_DAY, NONE)
    expect(shown(rows).slice(1, 4)).toEqual([
      "2:10 AM Diaper: Pee (Emily)",
      "2:15 AM Vitamin D: 400 IU (Emily)",
      "2:20 AM Diaper: Poo (Andrew)",
    ])
    expect(rows.find(({ id }) => id === DOSE.id)).toMatchObject({ kind: "dose", opens: "editDose" })
  })

  it("leaves out the doses when Supplements is hidden", () => {
    const day = dayWith({ doses: [DOSE] })
    expect(listRows(day, WITH_VITAMIN_D, NOW_ON_DAY, hiddenIn("supplements")).map(({ id }) => id)).not.toContain(
      DOSE.id,
    )
    expect(listRows(day, WITH_VITAMIN_D, NOW_ON_DAY, hiddenIn("feeds,diapers")).map(({ id }) => id)).toEqual([DOSE.id])
  })

  it("puts a feed before a diaper logged at the same moment", () => {
    const together = diaperAt(NURSED.startedAt)
    const rows = listRows(dayWith({ feeds: [NURSED], diapers: [together] }), DISPLAY, NOW_ON_DAY, NONE)
    expect(rows.map(({ id }) => id)).toEqual([NURSED.id, together.id])
  })

  it("shows a finished nap with its span, how long she slept and when she woke, as Today's row reads", () => {
    const rows = listRows(sleptDay(NAP), DISPLAY, NOW_ON_DAY, NONE)
    expect(shown(rows)).toEqual(["6:15 – 7:05 AM Nap: 50 min, Woke 7:05 AM (Andrew)"])
    expect(rows.map(({ opens }) => opens)).toEqual(["editSleep"])
  })

  it("names the other day where a sleep crosses midnight, on its start or on its end", () => {
    const intoTomorrow = sleptAt(local("20:30"), { kind: "night", endedAt: local("05:45", "2026-10-10") })
    expect(listRows(sleptDay(intoTomorrow, NIGHT), DISPLAY, NOW_ON_DAY, NONE).map(({ time }) => spaced(time))).toEqual([
      "Thu 7:45 PM – 5:10 AM",
      "8:30 PM – Sat 5:45 AM",
    ])
  })

  it("shows a sleep still going at its start, asleep now first and counting up, opening the Sleep sheet", () => {
    const napping = listRows(sleptDay(sleptAt(local("08:50"), { endedAt: null })), DISPLAY, NOW_ON_DAY, NONE)
    expect(shown(napping)).toEqual(["8:50 AM Nap: Asleep now, 40 min (Andrew)"])
    expect(napping.map(({ opens }) => opens)).toEqual(["sleep"])
    const sinceLastNight = sleptAt(local("21:15", "2026-10-08"), { kind: "night", endedAt: null })
    expect(shown(listRows(sleptDay(sinceLastNight), DISPLAY, NOW_ON_DAY, NONE))).toEqual([
      "Thu 9:15 PM Night: Asleep now, 12 h 15 min (Andrew)",
    ])
  })

  it("puts each sleep among the feeds and diapers by its start", () => {
    const rows = listRows(dayWith({ sleeps: [NAP, NIGHT] }), DISPLAY, NOW_ON_DAY, NONE)
    expect(rows.map(({ id }) => id)).toEqual([
      NIGHT.id,
      NURSED.id,
      PEE.id,
      POO.id,
      PAUSED.id,
      BOTTLE.id,
      BOTH.id,
      NAP.id,
      RUNNING.id,
    ])
  })

  it("puts a sleep and then a dose after a feed and a diaper at the same moment, as Today's list is built", () => {
    const together = {
      feeds: [NURSED],
      diapers: [diaperAt(NURSED.startedAt)],
      sleeps: [sleptAt(NURSED.startedAt)],
      doses: [dosedAt(NURSED.startedAt)],
    }
    const rows = listRows(dayWith(together), WITH_VITAMIN_D, NOW_ON_DAY, NONE)
    expect(rows.map(({ kind }) => kind)).toEqual(["nursing", "diaper", "sleep", "dose"])
  })

  it("leaves out sleeps behind the Sleep chip, and shows only them with feeds and diapers hidden", () => {
    const day = dayWith({ sleeps: [NAP] })
    expect(listRows(day, DISPLAY, NOW_ON_DAY, hiddenIn("sleep"))).toEqual(
      listRows(dayWith(), DISPLAY, NOW_ON_DAY, NONE),
    )
    expect(shown(listRows(day, DISPLAY, NOW_ON_DAY, hiddenIn("feeds,diapers")))).toEqual([
      "6:15 – 7:05 AM Nap: 50 min, Woke 7:05 AM (Andrew)",
    ])
  })
})

describe("listNote", () => {
  it("says nothing while there are rows, or when nothing was logged, which the totals say", () => {
    const day = dayWith()
    expect(listNote(day, listRows(day, DISPLAY, NOW_ON_DAY, NONE))).toBeNull()
    expect(listNote(dayWith({ feeds: [], diapers: [], measurements: [] }), [])).toBeNull()
  })

  it("says nothing is shown when the chips hide every row, a day's only dose included", () => {
    expect(listNote(dayWith({ feeds: [], diapers: [BOTH] }), [])).toBe("Nothing shown.")
    expect(listNote(dayWith({ feeds: [], diapers: [], measurements: [WEIGHED], doses: [DOSE] }), [])).toBe(
      "Nothing shown.",
    )
  })

  it("says there were no feeds, diapers, sleep or supplements on a day with only a measurement", () => {
    expect(listNote(dayWith({ feeds: [], diapers: [], measurements: [WEIGHED] }), [])).toBe(
      "No feeds, diapers, sleep or supplements.",
    )
  })

  it("counts a day's sleeps: nothing to say while they show, and nothing shown when the Sleep chip hides them", () => {
    const day = sleptDay(NAP)
    expect(listNote(day, listRows(day, DISPLAY, NOW_ON_DAY, NONE))).toBeNull()
    expect(listNote(day, listRows(day, DISPLAY, NOW_ON_DAY, hiddenIn("sleep")))).toBe("Nothing shown.")
  })
})

describe("logTimeOn", () => {
  it("leaves today to each sheet's own now, as Today's buttons do", () => {
    expect(logTimeOn("2026-10-09", DISPLAY.timeZone, NOW_ON_DAY + 45_000)).toBeNull()
  })

  it("logs at the same clock time, to the minute, on an earlier day", () => {
    expect(logTimeOn("2026-10-02", DISPLAY.timeZone, NOW_ON_DAY + 45_000)).toBe(local("09:30", "2026-10-02"))
  })

  it("logs at the first of the two times the clocks went back through", () => {
    const now = Date.parse("2026-11-02T01:30:00-08:00")
    const at = logTimeOn("2026-11-01", LOS_ANGELES, now)
    expect(at).toBe(Date.parse("2026-11-01T01:30:00-07:00"))
  })

  it("logs an hour on when the clocks skipped that time", () => {
    const now = Date.parse("2026-03-09T02:30:00-07:00")
    expect(logTimeOn("2026-03-08", LOS_ANGELES, now)).toBe(Date.parse("2026-03-08T03:30:00-07:00"))
  })
})

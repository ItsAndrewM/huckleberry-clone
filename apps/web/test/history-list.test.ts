import { describe, expect, it } from "vitest"
import { pendingId } from "../src/api/pending.ts"
import { hiddenIn } from "../src/features/history/history-kinds.ts"
import { listNote, listRows } from "../src/features/history/list-rows.ts"
import { logTimeOn } from "../src/features/history/log-time.ts"
import type { RecentRow } from "../src/features/today/recent-rows.ts"
import { BOTH, DISPLAY, dayWith, local, NOW_ON_DAY, NURSED, PEE, RUNNING, WEIGHED } from "./history-fixtures.ts"
import { ANDREW, diaperAt, feedAt, nursedFor } from "./today-fixtures.ts"

const LOS_ANGELES = "America/Los_Angeles"
const NONE = hiddenIn(undefined)

const spaced = (text: string) => text.replace(/\s/gu, " ")

const shown = (rows: ReadonlyArray<RecentRow>) =>
  rows.map(({ title, time, detail, by }) => `${spaced(time)} ${title}: ${detail.join(", ")} (${by})`)

const FROM_YESTERDAY = nursedFor(feedAt(local("23:40", "2026-10-08")), "left", 35)
const INTO_TOMORROW = nursedFor(feedAt(local("23:50")), "right", 20)

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

  it("puts a feed before a diaper logged at the same moment", () => {
    const together = diaperAt(NURSED.startedAt)
    const rows = listRows(dayWith({ feeds: [NURSED], diapers: [together] }), DISPLAY, NOW_ON_DAY, NONE)
    expect(rows.map(({ id }) => id)).toEqual([NURSED.id, together.id])
  })
})

describe("listNote", () => {
  it("says nothing while there are rows, or when nothing was logged, which the totals say", () => {
    const day = dayWith()
    expect(listNote(day, listRows(day, DISPLAY, NOW_ON_DAY, NONE))).toBeNull()
    expect(listNote(dayWith({ feeds: [], diapers: [], measurements: [] }), [])).toBeNull()
  })

  it("says nothing is shown when the chips hide every row", () => {
    expect(listNote(dayWith({ feeds: [], diapers: [BOTH] }), [])).toBe("Nothing shown.")
  })

  it("says there were no feeds or diapers on a day with only a measurement", () => {
    expect(listNote(dayWith({ feeds: [], diapers: [], measurements: [WEIGHED] }), [])).toBe("No feeds or diapers.")
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

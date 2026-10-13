import type { PortionEntry, SegmentEntry } from "@bt/contracts"
import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { deleteDiaper, logDiaper } from "../src/core/diapers.ts"
import { householdCsvOf } from "../src/core/export-csv.ts"
import { exportedTables } from "../src/core/export.ts"
import { deletePortion } from "../src/core/feeds/components.ts"
import { pauseFeed, startFeed } from "../src/core/feeds/lifecycle.ts"
import { logFeed } from "../src/core/feeds/log.ts"
import { deleteMeasurement, logMeasurement } from "../src/core/growth.ts"
import { startSleep } from "../src/core/sleeps/lifecycle.ts"
import { createSleep, saveSleep } from "../src/core/sleeps/store.ts"
import type { HouseholdSeed } from "../src/seed.ts"
import { bottle, newFeed, segment } from "./feed-fixtures.ts"
import {
  ACTION_ID,
  EMILY,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  NOW,
  SEED,
  saved,
  seededHousehold,
  stampOf,
} from "./fixtures.ts"

const HEADER =
  "Kind,Start,End,Left (min),Right (min),Breast milk (mL),Formula (mL),Wet,Dirty,Asleep (min),Nap or night,Weight (g),Length (cm),Head (cm),Logged by"

type Metrics = Record<"weightG" | "lengthCm" | "headCm", number | null>

const NO_METRICS = { weightG: null, lengthCm: null, headCm: null } satisfies Metrics

const fed = (sql: SqlStorage, segments: SegmentEntry[], portions: PortionEntry[] = [], email?: string) =>
  saved(logFeed(stampOf(sql, email), newFeed(segments, portions))(sql))

const diapered = (sql: SqlStorage, occurredAt: number, email?: string) =>
  saved(logDiaper(stampOf(sql, email), { actionId: ACTION_ID, occurredAt, wet: true, dirty: true })(sql))

const measured = (sql: SqlStorage, measuredAt: number, metrics: Partial<Metrics>) =>
  saved(logMeasurement(stampOf(sql), { actionId: ACTION_ID, measuredAt, ...NO_METRICS, ...metrics })(sql))

const linesOf = (csv: string) => csv.split("\r\n")

const inSeeded = async <R>(seed: HouseholdSeed, run: (sql: SqlStorage) => R) =>
  runInDurableObject(await seededHousehold(seed), (_instance, state) => run(state.storage.sql))

const ON_THE_SHEET = ["bottle_portions", "diapers", "feeds", "growth_measurements", "nursing_segments", "sleeps"]
const NOT_ENTRIES = ["caregivers", "child", "household"]

describe("householdCsvOf", () => {
  it("covers every table that holds entries, so a kind a later migration adds can't be left off the sheet quietly", async () => {
    expect(await inHousehold((sql) => exportedTables(sql))).toEqual([...ON_THE_SHEET, ...NOT_ENTRIES].toSorted())
  })

  it("answers only the header for a household with nothing logged", async () => {
    expect(await inHousehold((sql) => householdCsvOf(sql, NOW))).toBe(`${HEADER}\r\n`)
  })

  it("lists each feed, diaper and measurement oldest first, at the household's time, with who logged it", async () => {
    const csv = await inHousehold((sql) => {
      measured(sql, minutesAgo(30), { weightG: 4310.5, headCm: 38.1 })
      diapered(sql, minutesAgo(60), EMILY.email)
      fed(
        sql,
        [segment("left", minutesAgo(120), minutesAgo(105)), segment("right", minutesAgo(105), minutesAgo(93))],
        [bottle(minutesAgo(90), 30)],
      )
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv)).toEqual([
      HEADER,
      "Feed,2026-10-08 10:00,2026-10-08 10:30,15,12,30,0,,,,,,,,Andrew",
      "Diaper,2026-10-08 11:00,,,,,,yes,yes,,,,,,Emily",
      "Growth,2026-10-08 11:30,,,,,,,,,,4310.5,,38.1,Andrew",
      "",
    ])
  })

  it("leaves blank what a feed didn't have: minutes for a bottle, millilitres for nursing", async () => {
    const csv = await inHousehold((sql) => {
      fed(sql, [], [bottle(minutesAgo(90), 0, 60)])
      fed(sql, [segment("left", minutesAgo(60), minutesAgo(50))])
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv).slice(1, 3)).toEqual([
      "Feed,2026-10-08 10:30,2026-10-08 10:30,,,0,60,,,,,,,,Andrew",
      "Feed,2026-10-08 11:00,2026-10-08 11:10,10,0,,,,,,,,,,Andrew",
    ])
  })

  it("counts a running feed's minutes up to the export, to a tenth, and leaves its End blank", async () => {
    const csv = await inHousehold((sql) => {
      saved(startFeed(stampOf(sql), { actionId: ACTION_ID, side: "right", startedAt: minutesAgo(20) - 30_000 })(sql))
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv)[1]).toBe("Feed,2026-10-08 11:39,,0,20.5,,,,,,,,,,Andrew")
  })

  it("leaves a paused feed's End blank too, since it can still resume", async () => {
    const csv = await inHousehold((sql) => {
      const started = saved(
        startFeed(stampOf(sql), { actionId: ACTION_ID, side: "left", startedAt: minutesAgo(20) })(sql),
      )
      const pause = { actionId: crypto.randomUUID(), version: started.version, occurredAt: minutesAgo(5) }
      saved(pauseFeed(stampOf(sql), started.id, pause)(sql))
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv)[1]).toBe("Feed,2026-10-08 11:40,,15,0,,,,,,,,,,Andrew")
  })

  it("leaves out deleted entries, and the deleted parts of a feed", async () => {
    const csv = await inHousehold((sql) => {
      const diaper = diapered(sql, minutesAgo(60))
      saved(deleteDiaper(stampOf(sql), diaper.id, { actionId: crypto.randomUUID(), version: 1 })(sql))
      const measurement = measured(sql, minutesAgo(40), { lengthCm: 55 })
      saved(deleteMeasurement(stampOf(sql), measurement.id, { actionId: crypto.randomUUID(), version: 1 })(sql))
      const feed = fed(sql, [segment("left", minutesAgo(30), minutesAgo(20))], [bottle(minutesAgo(19), 40)])
      const portionId = feed.portions[0]?.id ?? "missing"
      saved(
        deletePortion(stampOf(sql), portionId, { actionId: crypto.randomUUID(), version: 1, deleteIfEmpty: false })(
          sql,
        ),
      )
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv)).toEqual([HEADER, "Feed,2026-10-08 11:30,2026-10-08 11:40,10,0,,,,,,,,,,Andrew", ""])
  })

  it("lists a sleep with its minutes asleep and whether it was a nap or a night, in time order", async () => {
    const csv = await inHousehold((sql) => {
      createSleep(sql, stampOf(sql, EMILY.email), {
        kind: "night",
        startedAt: minutesAgo(300),
        endedAt: minutesAgo(210),
      })
      diapered(sql, minutesAgo(200))
      createSleep(sql, stampOf(sql), { kind: "nap", startedAt: minutesAgo(120), endedAt: minutesAgo(75) })
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv).slice(1, 4)).toEqual([
      "Sleep,2026-10-08 07:00,2026-10-08 08:30,,,,,,,90,Night,,,,Emily",
      "Diaper,2026-10-08 08:40,,,,,,yes,yes,,,,,,Andrew",
      "Sleep,2026-10-08 10:00,2026-10-08 10:45,,,,,,,45,Nap,,,,Andrew",
    ])
  })

  it("counts a running sleep's minutes up to the export, to a tenth, and leaves its End blank", async () => {
    const csv = await inHousehold((sql) => {
      saved(startSleep(stampOf(sql), { actionId: ACTION_ID, kind: "nap", startedAt: minutesAgo(40) - 30_000 })(sql))
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv)[1]).toBe("Sleep,2026-10-08 11:19,,,,,,,,40.5,Nap,,,,Andrew")
  })

  it("leaves out a deleted sleep", async () => {
    const csv = await inHousehold((sql) => {
      const sleep = createSleep(sql, stampOf(sql), { kind: "nap", startedAt: minutesAgo(90), endedAt: minutesAgo(60) })
      saveSleep(sql, stampOf(sql), { ...sleep, deletedAt: NOW })
      return householdCsvOf(sql, NOW)
    })
    expect(csv).toBe(`${HEADER}\r\n`)
  })

  it("quotes a name holding a comma, a quote or a line break, and makes one starting =, +, - or @ inert", async () => {
    const caregivers = [
      { email: "a@example.test", displayName: '=HYPERLINK("x")' },
      { email: "b@example.test", displayName: "Smith, Em" },
      { email: "c@example.test", displayName: "-1" },
      { email: "d@example.test", displayName: "Two\nLines" },
      { email: "e@example.test", displayName: "+1 555 0100" },
      { email: "f@example.test", displayName: "@home" },
    ]
    const csv = await inSeeded({ ...SEED, caregivers }, (sql) => {
      caregivers.forEach(({ email }, index) => diapered(sql, minutesAgo(60 - index), email))
      return householdCsvOf(sql, NOW)
    })
    expect(csv.split("\r\n").map((line) => line.split(",yes,yes,,,,,,")[1])).toEqual([
      undefined,
      `"'=HYPERLINK(""x"")"`,
      '"Smith, Em"',
      "'-1",
      '"Two\nLines"',
      "'+1 555 0100",
      "'@home",
      undefined,
    ])
  })

  it("writes times in the household's zone, whatever it is", async () => {
    const csv = await inSeeded({ ...SEED, timeZone: "Europe/London" }, (sql) => {
      diapered(sql, NOW - 5 * MINUTE_MS)
      return householdCsvOf(sql, NOW)
    })
    expect(linesOf(csv)[1]).toBe("Diaper,2026-10-08 19:55,,,,,,yes,yes,,,,,,Andrew")
  })
})

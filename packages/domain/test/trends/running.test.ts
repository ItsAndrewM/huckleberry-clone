import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  type DiaperChange,
  type Interval,
  localDateOf,
  type RunningPoint,
  runningTotals,
  type SleepKind,
  type SleepSession,
  type StartedFeed,
  totalsIn,
  zonedDayBounds,
} from "../../src/index.ts"
import { VANCOUVER, zonedInstants } from "../fixtures/zones.ts"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = zonedDayBounds("2026-10-09", VANCOUVER)
const local = (time: string, date = "2026-10-09") => Date.parse(`${date}T${time}:00-07:00`)
const AFTER = local("12:00", "2026-10-10")
const NOON = local("12:00")

const sides = (startedAt: number, ...parts: ReadonlyArray<readonly ["left" | "right", number, number | null]>) => ({
  startedAt,
  segments: parts.map(([side, from, to]) => ({ side, startedAt: from, endedAt: to })),
  portions: [],
})

const bottle = (occurredAt: number, breastMilkMl: number, formulaMl = 0): StartedFeed => ({
  startedAt: occurredAt,
  segments: [],
  portions: [{ occurredAt, breastMilkMl, formulaMl }],
})

const diaper = (occurredAt: number): DiaperChange => ({ occurredAt, wet: true, dirty: false })

const running = (
  period: Interval,
  feeds: ReadonlyArray<StartedFeed>,
  diapers: ReadonlyArray<DiaperChange>,
  now: number,
) => runningTotals(period, { feeds, diapers, sleeps: [] }, now)

const slept = (kind: SleepKind, startedAt: number, endedAt: number | null): SleepSession => ({
  kind,
  startedAt,
  endedAt,
})

const flat = (start: number, end: number) => [
  { at: start, value: 0 },
  { at: end, value: 0 },
]

describe("runningTotals", () => {
  it("draws every line flat at zero across a past day with nothing logged", () => {
    expect(running(DAY, [], [], AFTER)).toEqual({
      feedsStarted: flat(DAY.start, DAY.end),
      nursingSeconds: flat(DAY.start, DAY.end),
      bottleMl: flat(DAY.start, DAY.end),
      diapers: flat(DAY.start, DAY.end),
      sleepSeconds: flat(DAY.start, DAY.end),
    })
  })

  it("stops today's lines at now", () => {
    expect(running(DAY, [], [], NOON).diapers).toEqual(flat(DAY.start, NOON))
  })

  it("steps up by one at each feed's start and each diaper", () => {
    const feeds = [bottle(local("04:00"), 90), sides(local("01:05"), ["left", local("01:05"), local("01:19")])]
    const totals = running(DAY, feeds, [diaper(local("02:10"))], AFTER)
    expect(totals.feedsStarted).toEqual([
      { at: DAY.start, value: 0 },
      { at: local("01:05"), value: 0 },
      { at: local("01:05"), value: 1 },
      { at: local("04:00"), value: 1 },
      { at: local("04:00"), value: 2 },
      { at: DAY.end, value: 2 },
    ])
    expect(totals.diapers).toEqual([
      { at: DAY.start, value: 0 },
      { at: local("02:10"), value: 0 },
      { at: local("02:10"), value: 1 },
      { at: DAY.end, value: 1 },
    ])
  })

  it("climbs through each side nursed and stays level between them", () => {
    const feed = sides(
      local("01:05"),
      ["left", local("01:05"), local("01:19")],
      ["right", local("01:19"), local("01:28")],
    )
    expect(running(DAY, [feed], [], AFTER).nursingSeconds).toEqual([
      { at: DAY.start, value: 0 },
      { at: local("01:05"), value: 0 },
      { at: local("01:19"), value: 840 },
      { at: local("01:19"), value: 840 },
      { at: local("01:28"), value: 1380 },
      { at: DAY.end, value: 1380 },
    ])
  })

  it("starts with the nursing a feed from the day before carried past midnight, without counting that feed", () => {
    const feed = sides(local("23:40", "2026-10-08"), ["left", local("23:40", "2026-10-08"), local("00:15")])
    const totals = running(DAY, [feed], [], AFTER)
    expect(totals.nursingSeconds).toEqual([
      { at: DAY.start, value: 0 },
      { at: DAY.start, value: 0 },
      { at: local("00:15"), value: 900 },
      { at: DAY.end, value: 900 },
    ])
    expect(totals.feedsStarted).toEqual(flat(DAY.start, DAY.end))
  })

  it("follows a side that's still running up to now", () => {
    const feed = sides(local("11:30"), ["left", local("11:30"), null])
    expect(running(DAY, [feed], [], NOON).nursingSeconds.at(-1)).toEqual({ at: NOON, value: 1800 })
  })

  it("rounds each side down to whole seconds, as the day's totals do", () => {
    const feed = sides(
      local("01:00"),
      ["left", local("01:00"), local("01:00") + 1500],
      ["right", local("01:00") + 1500, local("01:00") + 3000],
    )
    expect(running(DAY, [feed], [], AFTER).nursingSeconds.at(-1)?.value).toBe(2)
  })

  it("floors each side once across its segments: two left segments of 1.5 s make 3, not 2", () => {
    const feed = sides(
      local("01:00"),
      ["left", local("01:00"), local("01:00") + 1500],
      ["left", local("02:00"), local("02:00") + 1500],
    )
    expect(running(DAY, [feed], [], AFTER).nursingSeconds.at(-1)?.value).toBe(3)
  })

  it("leaves out a side lying wholly outside the day, before it began or from its end", () => {
    const yesterday = local("23:00", "2026-10-08")
    const beforeDay = sides(yesterday, ["left", yesterday, local("23:30", "2026-10-08")])
    const fromEnd = sides(DAY.end, ["right", DAY.end, local("00:30", "2026-10-10")])
    expect(running(DAY, [beforeDay, fromEnd], [], AFTER).nursingSeconds).toEqual(flat(DAY.start, DAY.end))
  })

  it("climbs in time order when the feeds list their segments out of start order", () => {
    const later = sides(local("01:19"), ["left", local("01:19"), local("01:28")])
    const earlier = sides(local("01:05"), ["right", local("01:05"), local("01:19")])
    expect(running(DAY, [later, earlier], [], AFTER).nursingSeconds).toEqual([
      { at: DAY.start, value: 0 },
      { at: local("01:05"), value: 0 },
      { at: local("01:19"), value: 840 },
      { at: local("01:19"), value: 840 },
      { at: local("01:28"), value: 1380 },
      { at: DAY.end, value: 1380 },
    ])
  })

  it("adds each bottle's breast milk and formula, in tenths of a mL", () => {
    const feeds = [bottle(local("02:00"), 30.1, 10), bottle(local("05:00"), 0, 30.2)]
    expect(running(DAY, feeds, [], AFTER).bottleMl).toEqual([
      { at: DAY.start, value: 0 },
      { at: local("02:00"), value: 0 },
      { at: local("02:00"), value: 40.1 },
      { at: local("05:00"), value: 40.1 },
      { at: local("05:00"), value: 70.3 },
      { at: DAY.end, value: 70.3 },
    ])
  })

  it("ends at an entry a phone logged a little ahead of the clock, never before it (AC 21)", () => {
    const ahead = NOON + 2 * MINUTE
    expect(running(DAY, [], [diaper(ahead)], NOON).diapers.at(-1)).toEqual({ at: ahead, value: 1 })
  })

  it("leaves out what falls outside the day", () => {
    const outside = [bottle(local("23:59", "2026-10-08"), 60), bottle(DAY.end, 60)]
    expect(running(DAY, outside, [diaper(DAY.end)], AFTER)).toEqual({
      feedsStarted: flat(DAY.start, DAY.end),
      nursingSeconds: flat(DAY.start, DAY.end),
      bottleMl: flat(DAY.start, DAY.end),
      diapers: flat(DAY.start, DAY.end),
      sleepSeconds: flat(DAY.start, DAY.end),
    })
  })
})

describe("a day's running sleep", () => {
  const sleptOn = (sleeps: ReadonlyArray<SleepSession>, now = AFTER) =>
    runningTotals(DAY, { feeds: [], diapers: [], sleeps }, now).sleepSeconds

  it("climbs through each sleep and stays level between them", () => {
    expect(
      sleptOn([slept("nap", local("09:00"), local("10:00")), slept("nap", local("13:00"), local("13:30"))]),
    ).toEqual([
      { at: DAY.start, value: 0 },
      { at: local("09:00"), value: 0 },
      { at: local("10:00"), value: 3600 },
      { at: local("13:00"), value: 3600 },
      { at: local("13:30"), value: 5400 },
      { at: DAY.end, value: 5400 },
    ])
  })

  it("starts with the part of last night's sleep after midnight", () => {
    expect(sleptOn([slept("night", local("20:00", "2026-10-08"), local("06:00"))]).slice(0, 3)).toEqual([
      { at: DAY.start, value: 0 },
      { at: DAY.start, value: 0 },
      { at: local("06:00"), value: 6 * 3600 },
    ])
  })

  it("follows a sleep that's still running up to now", () => {
    expect(sleptOn([slept("nap", local("11:30"), null)], NOON).at(-1)).toEqual({ at: NOON, value: 1800 })
  })

  it("rounds naps and nights down once each, as the day's totals do", () => {
    const nap = slept("nap", local("09:00"), local("09:00") + 1500)
    const night = slept("night", local("20:00"), local("20:00") + 1500)
    const second = slept("nap", local("10:00"), local("10:00") + 1500)
    expect(sleptOn([nap, night]).at(-1)?.value).toBe(2)
    expect(sleptOn([nap, second]).at(-1)?.value).toBe(3)
  })
})

const minuteOf = (instant: number) => Math.floor(instant / MINUTE) * MINUTE

const oneAfterAnother = (from: number, rows: ReadonlyArray<readonly [number, number, number]>) =>
  rows.reduce<{ readonly feeds: StartedFeed[]; readonly at: number }>(
    ({ feeds, at }, [gap, minutes, tenths]) => {
      const start = at + gap * MINUTE
      const end = start + minutes * MINUTE
      const feed = minutes === 0 ? bottle(start, (tenths + 1) / 10, tenths / 10) : sides(start, ["left", start, end])
      return { feeds: [...feeds, feed], at: end }
    },
    { feeds: [], at: from },
  )

const sleepsAfter = (from: number, rows: ReadonlyArray<readonly [number, number, boolean]>) =>
  rows.reduce<{ readonly sleeps: SleepSession[]; readonly at: number }>(
    ({ sleeps, at }, [gap, minutes, night]) => {
      const start = at + gap * MINUTE + 1_250
      const end = start + minutes * MINUTE + 700
      return { sleeps: [...sleeps, slept(night ? "night" : "nap", start, end)], at: end }
    },
    { sleeps: [], at: from },
  ).sleeps

const householdNear = (anchor: number) =>
  fc
    .tuple(
      fc.array(fc.tuple(fc.integer({ min: 0, max: 6 * 60 }), fc.integer({ min: 0, max: 90 }), fc.nat(2000)), {
        maxLength: 10,
      }),
      fc.array(fc.integer({ min: -30 * 60, max: 30 * 60 }), { maxLength: 8 }),
      fc.integer({ min: -2 * 60, max: 36 * 60 }),
      fc.boolean(),
      fc.array(fc.tuple(fc.integer({ min: 0, max: 8 * 60 }), fc.integer({ min: 1, max: 12 * 60 }), fc.boolean()), {
        maxLength: 6,
      }),
    )
    .map(([rows, diaperOffsets, nowOffset, runningFeed, sleepRows]) => {
      const { feeds, at } = oneAfterAnother(minuteOf(anchor) - 30 * HOUR, rows)
      return {
        feeds: runningFeed ? [...feeds, sides(at, ["right", at, null])] : feeds,
        diapers: diaperOffsets.map((offset) => diaper(minuteOf(anchor) + offset * MINUTE)),
        sleeps: sleepsAfter(minuteOf(anchor) - 30 * HOUR, sleepRows),
        now: minuteOf(anchor) + nowOffset * MINUTE,
      }
    })

const inOrder = (points: ReadonlyArray<RunningPoint>) =>
  points.every((point, index) => {
    const before = points[index - 1]
    return before === undefined || (before.at <= point.at && before.value <= point.value)
  })

describe("runningTotals across any day", () => {
  it("starts at zero, only climbs, and ends on the day's totals, across clock changes", () => {
    const days = zonedInstants.chain(([instant, zone]) => fc.tuple(fc.constant(zone), householdNear(instant)))
    fc.assert(
      fc.property(days, ([zone, { feeds, diapers, sleeps, now }]) => {
        const bounds = zonedDayBounds(localDateOf(now, zone), zone)
        const climbed = runningTotals(bounds, { feeds, diapers, sleeps }, now)
        const totals = totalsIn(bounds, { feeds, diapers, sleeps }, now)
        const series = [
          climbed.feedsStarted,
          climbed.nursingSeconds,
          climbed.bottleMl,
          climbed.diapers,
          climbed.sleepSeconds,
        ]
        expect({
          starts: series.map((points) => points[0]),
          ordered: series.map(inOrder),
          ends: series.map((points) => points.at(-1)?.value),
        }).toEqual({
          starts: series.map(() => ({ at: bounds.start, value: 0 })),
          ordered: [true, true, true, true, true],
          ends: [totals.feedsStarted, totals.nursingSeconds, totals.bottleMl, totals.diapers, totals.sleepSeconds],
        })
      }),
    )
  })
})

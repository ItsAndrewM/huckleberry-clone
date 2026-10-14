import type { Diaper, Dose, Feed, Measurement, Sleep } from "@bt/contracts"
import { feedSummary, type Instant, localDateTimeOf, sleepElapsed, type TimeZone } from "@bt/domain"
import { calendarOf } from "./calendar.ts"
import { liveDiapersSince } from "./diapers.ts"
import { liveFeedsSince } from "./feeds/reads.ts"
import { growthOf } from "./growth.ts"
import { liveSleepsSince } from "./sleeps/reads.ts"
import { supplementsOf } from "./supplements/definitions.ts"
import { liveDosesSince } from "./supplements/doses.ts"

const COLUMNS = [
  "Kind",
  "Start",
  "End",
  "Left (min)",
  "Right (min)",
  "Breast milk (mL)",
  "Formula (mL)",
  "Wet",
  "Dirty",
  "Asleep (min)",
  "Nap or night",
  "Supplement",
  "Dose",
  "Weight (g)",
  "Length (cm)",
  "Head (cm)",
  "Logged by",
] as const

type Column = (typeof COLUMNS)[number]
type Cells = Partial<Record<Column, string>>

interface Line {
  readonly at: Instant
  readonly cells: Cells
}

interface Context {
  readonly zone: TimeZone
  readonly names: ReadonlyMap<string, string>
  readonly supplements: ReadonlyMap<string, string>
  readonly now: Instant
}

const BEGINNING: Instant = 0
const FORMULA_START = /^[=+\-@\t\r]/
const NEEDS_QUOTES = /[",\r\n]/

const timeOf = (instant: Instant, zone: TimeZone) => localDateTimeOf(instant, zone).replace("T", " ")
const minutesOf = (seconds: number) => String(Math.round(seconds / 6) / 10)
const yesOrBlank = (flag: boolean) => (flag ? "yes" : "")
const numberOrBlank = (value: number | null) => (value === null ? "" : String(value))

const feedLine = (feed: Feed, { zone, names, now }: Context): Line => {
  const summary = feedSummary(feed, now)
  const nursed = feed.segments.length > 0
  const bottled = feed.portions.length > 0
  return {
    at: feed.startedAt,
    cells: {
      Kind: "Feed",
      Start: timeOf(feed.startedAt, zone),
      End: feed.status === "active" || feed.endedAt === null ? "" : timeOf(feed.endedAt, zone),
      "Left (min)": nursed ? minutesOf(summary.leftSeconds) : "",
      "Right (min)": nursed ? minutesOf(summary.rightSeconds) : "",
      "Breast milk (mL)": bottled ? String(summary.breastMilkMl) : "",
      "Formula (mL)": bottled ? String(summary.formulaMl) : "",
      "Logged by": names.get(feed.createdBy) ?? "",
    },
  }
}

const diaperLine = (diaper: Diaper, { zone, names }: Context): Line => ({
  at: diaper.occurredAt,
  cells: {
    Kind: "Diaper",
    Start: timeOf(diaper.occurredAt, zone),
    Wet: yesOrBlank(diaper.wet),
    Dirty: yesOrBlank(diaper.dirty),
    "Logged by": names.get(diaper.createdBy) ?? "",
  },
})

const sleepLine = (sleep: Sleep, { zone, names, now }: Context): Line => ({
  at: sleep.startedAt,
  cells: {
    Kind: "Sleep",
    Start: timeOf(sleep.startedAt, zone),
    End: sleep.endedAt === null ? "" : timeOf(sleep.endedAt, zone),
    "Asleep (min)": minutesOf(sleepElapsed(sleep, now)),
    "Nap or night": sleep.kind === "nap" ? "Nap" : "Night",
    "Logged by": names.get(sleep.createdBy) ?? "",
  },
})

const doseLine = (dose: Dose, { zone, names, supplements }: Context): Line => ({
  at: dose.occurredAt,
  cells: {
    Kind: "Supplement",
    Start: timeOf(dose.occurredAt, zone),
    Supplement: supplements.get(dose.supplementId) ?? "",
    Dose: dose.dose,
    "Logged by": names.get(dose.createdBy) ?? "",
  },
})

const measurementLine = (measurement: Measurement, { zone, names }: Context): Line => ({
  at: measurement.measuredAt,
  cells: {
    Kind: "Growth",
    Start: timeOf(measurement.measuredAt, zone),
    "Weight (g)": numberOrBlank(measurement.weightG),
    "Length (cm)": numberOrBlank(measurement.lengthCm),
    "Head (cm)": numberOrBlank(measurement.headCm),
    "Logged by": names.get(measurement.createdBy) ?? "",
  },
})

const fieldOf = (text: string) => {
  const inert = FORMULA_START.test(text) ? `'${text}` : text
  return NEEDS_QUOTES.test(inert) ? `"${inert.replaceAll('"', '""')}"` : inert
}

const recordOf = (cells: Cells) => COLUMNS.map((column) => fieldOf(cells[column] ?? "")).join(",")

const caregiverNames = (sql: SqlStorage) =>
  new Map(
    sql
      .exec<{ id: string; display_name: string }>("SELECT id, display_name FROM caregivers")
      .toArray()
      .map(({ id, display_name }) => [id, display_name]),
  )

const supplementNames = (sql: SqlStorage) => new Map(supplementsOf(sql).map(({ id, name }) => [id, name]))

export const householdCsvOf = (sql: SqlStorage, now: Instant): string => {
  const context: Context = {
    zone: calendarOf(sql).zone,
    names: caregiverNames(sql),
    supplements: supplementNames(sql),
    now,
  }
  const lines = [
    ...liveFeedsSince(sql, BEGINNING).map((feed) => feedLine(feed, context)),
    ...liveDiapersSince(sql, BEGINNING).map((diaper) => diaperLine(diaper, context)),
    ...liveSleepsSince(sql, BEGINNING).map((sleep) => sleepLine(sleep, context)),
    ...liveDosesSince(sql, BEGINNING).map((dose) => doseLine(dose, context)),
    ...growthOf(sql)
      .measurements.toReversed()
      .map((measurement) => measurementLine(measurement, context)),
  ].toSorted((a, b) => a.at - b.at)
  const header = COLUMNS.map(fieldOf).join(",")
  return `${[header, ...lines.map((line) => recordOf(line.cells))].join("\r\n")}\r\n`
}

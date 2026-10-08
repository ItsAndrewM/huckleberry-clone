import { tzScan } from "@date-fns/tz"
import fc from "fast-check"

export const VANCOUVER = "America/Vancouver"
export const LONDON = "Europe/London"

export const PROPERTY_ZONES = [
  "America/Vancouver",
  "America/New_York",
  "America/St_Johns",
  "America/Havana",
  "America/Santiago",
  "Europe/London",
  "Europe/Berlin",
  "Australia/Lord_Howe",
  "Asia/Kolkata",
  "UTC",
]

const HOUR = 3_600_000
const SPAN = { start: new Date(Date.UTC(2020, 0, 1)), end: new Date(Date.UTC(2035, 0, 1)) }
const TRANSITIONS = PROPERTY_ZONES.flatMap((zone) =>
  tzScan(zone, SPAN).map((change) => ({ zone, at: change.date.getTime() })),
)

export const zonedInstants = fc.oneof(
  fc.tuple(fc.integer({ min: SPAN.start.getTime(), max: SPAN.end.getTime() }), fc.constantFrom(...PROPERTY_ZONES)),
  fc
    .constantFrom(...TRANSITIONS)
    .chain(({ zone, at }) => fc.tuple(fc.integer({ min: at - 3 * HOUR, max: at + 3 * HOUR }), fc.constant(zone))),
)

const wallClockParts = (instant: number, zone: string) =>
  new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  )

export const intlWallClock = (instant: number, zone: string): string => {
  const parts = wallClockParts(instant, zone)
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}`
}

export const intlDate = (instant: number, zone: string): string => intlWallClock(instant, zone).slice(0, 10)

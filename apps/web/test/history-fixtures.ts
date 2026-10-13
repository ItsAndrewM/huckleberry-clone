import type { DayPeriod, Feed, NursingSegment } from "@bt/contracts"
import { zonedDayBounds } from "@bt/domain"
import type { Display } from "../src/features/today/display.ts"
import { measurement } from "./growth-fixtures.ts"
import { ANDREW, diaperAt, EMILY, feedAt, NO_TOTALS, ZONE } from "./today-fixtures.ts"

export const DATE = "2026-10-09"
export const BOUNDS = zonedDayBounds(DATE, ZONE)
export const LOCALE = "en-US"

export const local = (time: string, date = DATE) => Date.parse(`${date}T${time}:00-07:00`)

export const DISPLAY: Display = {
  timeZone: ZONE,
  volume: "ml",
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  locale: LOCALE,
}

const side = (id: string, kind: NursingSegment["side"], from: string, to: string | null): NursingSegment => ({
  id,
  side: kind,
  startedAt: local(from),
  endedAt: to === null ? null : local(to),
})

const portion = (id: string, at: string, breastMilkMl: number, formulaMl: number) => ({
  id,
  occurredAt: local(at),
  breastMilkMl,
  formulaMl,
})

export const NURSED: Feed = {
  ...feedAt(local("01:05")),
  endedAt: local("01:28"),
  segments: [side("nursed-0", "left", "01:05", "01:19"), side("nursed-1", "right", "01:19", "01:28")],
}

export const PAUSED: Feed = {
  ...feedAt(local("03:00"), { createdBy: EMILY }),
  endedAt: local("03:45"),
  segments: [side("paused-0", "left", "03:00", "03:10"), side("paused-1", "right", "03:30", "03:40")],
  portions: [portion("paused-p0", "03:45", 60, 0)],
}

export const BOTTLE: Feed = { ...feedAt(local("04:00")), portions: [portion("bottle-p0", "04:00", 0, 90)] }

export const RUNNING: Feed = {
  ...feedAt(local("08:40"), { createdBy: EMILY }),
  status: "active",
  endedAt: null,
  segments: [side("running-0", "left", "08:40", null)],
}

export const PEE = diaperAt(local("02:10"))
export const POO = diaperAt(local("02:20"), { wet: false, dirty: true, createdBy: ANDREW })
export const BOTH = diaperAt(local("05:30"), { dirty: true })

export const WEIGHED = measurement("m-day", local("08:00"), { weightG: 4210, lengthCm: 55, headCm: 37.5 })

export const NOW_ON_DAY = local("09:30")

export const dayWith = (change: Partial<DayPeriod> = {}): DayPeriod => ({
  date: DATE,
  bounds: BOUNDS,
  asOf: NOW_ON_DAY,
  totals: NO_TOTALS,
  feeds: [NURSED, PAUSED, BOTTLE, RUNNING],
  diapers: [PEE, POO, BOTH],
  sleeps: [],
  measurements: [WEIGHED],
  doses: [],
  ...change,
})

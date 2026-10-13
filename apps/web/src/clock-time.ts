export type ClockFormat = "time" | "dayTime" | "dateTime"

const OPTIONS = {
  time: { hour: "numeric", minute: "2-digit" },
  dayTime: { weekday: "short", hour: "numeric", minute: "2-digit" },
  dateTime: { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
} satisfies Record<ClockFormat, Intl.DateTimeFormatOptions>

const formatters = new Map<string, Intl.DateTimeFormat>()

export const formatterFor = (format: ClockFormat, timeZone: string, locale?: string) => {
  const key = `${format} ${timeZone} ${locale ?? ""}`
  const kept = formatters.get(key)
  if (kept !== undefined) return kept
  const formatter = new Intl.DateTimeFormat(locale, { ...OPTIONS[format], timeZone })
  formatters.set(key, formatter)
  return formatter
}

export const clockTime = (instant: number, timeZone: string, locale?: string) =>
  formatterFor("time", timeZone, locale).format(instant)

export const dayClockTime = (instant: number, timeZone: string, locale?: string) =>
  formatterFor("dayTime", timeZone, locale).format(instant)

export const dateClockTime = (instant: number, timeZone: string, locale?: string) =>
  formatterFor("dateTime", timeZone, locale).format(instant)

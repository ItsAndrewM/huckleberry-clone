export const clockTime = (instant: number, timeZone: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(instant)

export const dayClockTime = (instant: number, timeZone: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit", timeZone }).format(instant)

export const dateClockTime = (instant: number, timeZone: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(instant)

export const clockTime = (instant: number, timeZone: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(instant)

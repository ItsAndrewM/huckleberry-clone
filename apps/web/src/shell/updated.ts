import { localDateOf } from "@bt/domain"

const timeOf = (instant: number, timeZone: string, locale: string | undefined) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(instant)

const dayOf = (instant: number, timeZone: string, locale: string | undefined) =>
  new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone }).format(instant)

export const phoneZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const updatedLine = (heardAt: number, now: number, timeZone: string, locale?: string) => {
  const time = timeOf(heardAt, timeZone, locale)
  if (localDateOf(heardAt, timeZone) === localDateOf(now, timeZone)) return `Updated ${time}.`
  return `Updated ${dayOf(heardAt, timeZone, locale)}, ${time}.`
}

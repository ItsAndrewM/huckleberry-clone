import { localDateOf } from "@bt/domain"
import { clockTime } from "../clock-time.ts"

const dayOf = (instant: number, timeZone: string, locale: string | undefined) =>
  new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone }).format(instant)

export const phoneZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const updatedLine = (heardAt: number, now: number, timeZone: string, locale?: string) => {
  const time = clockTime(heardAt, timeZone, locale)
  if (localDateOf(heardAt, timeZone) === localDateOf(now, timeZone)) return `Updated ${time}.`
  return `Updated ${dayOf(heardAt, timeZone, locale)}, ${time}.`
}

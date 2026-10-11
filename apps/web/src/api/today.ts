import { queryKeys, type Today } from "@bt/contracts"
import { zonedDayBounds } from "@bt/domain"
import { queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export const NEXT_DAY_RETRY_MS = 60_000

export const todayQuery = (api: HouseholdApi) =>
  queryOptions({ queryKey: queryKeys.today, queryFn: () => api.request((client) => client.today.today()) })

export const last24hQuery = (api: HouseholdApi) =>
  queryOptions({ queryKey: queryKeys.last24h, queryFn: () => api.request((client) => client.today.last24h()) })

export const untilNextDay = ({ date }: Pick<Today, "date">, timeZone: string, now: number) => {
  const { end } = zonedDayBounds(date, timeZone)
  return end > now ? end - now : NEXT_DAY_RETRY_MS
}

import { type DayPeriod, type Me, queryKeys, type RecentEntry, type Today } from "@bt/contracts"
import type { QueryClient } from "@tanstack/react-query"
import { dayCopy, swappedDay, swappedEntry, swappedToday, type Swapping, todayCopy } from "./swap.ts"
import type { Pending } from "./today-change.ts"

export const DAYS = { queryKey: ["day"] } as const

export interface EntriesPended {
  readonly cache: "entries"
  readonly id: string
  readonly original: RecentEntry
  readonly pending: Pending
}

const todayOf = (queryClient: QueryClient) => queryClient.getQueryData<Today>(queryKeys.today)

const cachedDays = (queryClient: QueryClient) =>
  queryClient.getQueriesData<DayPeriod>(DAYS).flatMap(([key, day]) => (day === undefined ? [] : [{ key, day }]))

export const cachedEntry = (queryClient: QueryClient, id: string): RecentEntry | null => {
  const today = todayOf(queryClient)
  const inToday = today === undefined ? null : todayCopy(today, id)
  if (inToday !== null) return inToday
  return cachedDays(queryClient).reduce<RecentEntry | null>((found, { day }) => found ?? dayCopy(day, id), null)
}

const swapEverywhere = (queryClient: QueryClient, pending: Pending, id: string, after: RecentEntry | null) => {
  const today = todayOf(queryClient)
  const inToday = today === undefined ? null : todayCopy(today, id)
  if (today !== undefined && (inToday !== null || after !== null)) {
    queryClient.setQueryData(queryKeys.today, swappedToday(today, pending, { before: inToday, after }))
  }
  for (const { key, day } of cachedDays(queryClient)) {
    const before = dayCopy(day, id)
    if (before !== null || after !== null)
      queryClient.setQueryData(key, swappedDay(day, pending.now, { before, after }))
  }
}

export const pendEntries = async (
  queryClient: QueryClient,
  action: Swapping,
  now: number,
): Promise<EntriesPended | null> => {
  const me = queryClient.getQueryData<Me>(queryKeys.me)
  const original = cachedEntry(queryClient, action.id)
  if (me === undefined || original === null) return null
  await Promise.all([queryClient.cancelQueries({ queryKey: queryKeys.today }), queryClient.cancelQueries(DAYS)])
  const pending = { by: me.caregiver.id, now, zone: me.household.timeZone }
  swapEverywhere(queryClient, pending, action.id, swappedEntry(original, action, pending))
  return { cache: "entries", id: action.id, original, pending }
}

export const unswapped = (queryClient: QueryClient, { id, original, pending }: EntriesPended) =>
  swapEverywhere(queryClient, pending, id, original)

import { type Growth, type Me, queryKeys, type Today } from "@bt/contracts"
import type { QueryClient, QueryKey } from "@tanstack/react-query"
import { type Action, isMeasurementAction, type MeasurementAction } from "./actions.ts"
import { DAYS, type EntriesPended, pendEntries, unswapped } from "./entry-cache.ts"
import { pendingGrowth, savedGrowth, withdrawnGrowth } from "./growth-cache.ts"
import type { Saved } from "./send.ts"
import { isSwapping } from "./swap.ts"
import { pendingToday, savedToday, withdrawnToday } from "./today-cache.ts"
import type { Pending } from "./today-change.ts"

interface TodayPended {
  readonly cache: "today"
  readonly before: Today
  readonly pending: Pending
}

interface GrowthPended {
  readonly cache: "growth"
  readonly before: Growth
}

export type Pended = TodayPended | GrowthPended | EntriesPended

const pendToday = async (queryClient: QueryClient, action: Action, now: number): Promise<Pended | null> => {
  if (queryClient.getQueryData(queryKeys.today) === undefined) return null
  await queryClient.cancelQueries({ queryKey: queryKeys.today })
  const before = queryClient.getQueryData<Today>(queryKeys.today)
  const me = queryClient.getQueryData<Me>(queryKeys.me)
  if (before === undefined || me === undefined) return null
  const pending = { by: me.caregiver.id, now, zone: me.household.timeZone }
  const shown = pendingToday(before, action, pending)
  if (shown === before) return null
  queryClient.setQueryData(queryKeys.today, shown)
  return { cache: "today", before, pending }
}

const pendGrowth = async (queryClient: QueryClient, action: MeasurementAction, now: number): Promise<Pended | null> => {
  if (queryClient.getQueryData(queryKeys.growth) === undefined) return null
  await queryClient.cancelQueries({ queryKey: queryKeys.growth })
  const before = queryClient.getQueryData<Growth>(queryKeys.growth)
  const me = queryClient.getQueryData<Me>(queryKeys.me)
  if (before === undefined || me === undefined) return null
  const shown = pendingGrowth(before, action, { by: me.caregiver.id, now })
  if (shown === before) return null
  queryClient.setQueryData(queryKeys.growth, shown)
  return { cache: "growth", before }
}

export const pendIn = (queryClient: QueryClient, action: Action, now: number): Promise<Pended | null> => {
  if (isMeasurementAction(action)) return pendGrowth(queryClient, action, now)
  return isSwapping(action) ? pendEntries(queryClient, action, now) : pendToday(queryClient, action, now)
}

const withdraw = (queryClient: QueryClient, action: Action, pended: Pended) => {
  if (pended.cache === "entries") {
    unswapped(queryClient, pended)
    return
  }
  if (pended.cache === "today") {
    const { before, pending } = pended
    queryClient.setQueryData<Today>(queryKeys.today, (today) =>
      today === undefined ? today : withdrawnToday(today, action, pending, before),
    )
    return
  }
  if (!isMeasurementAction(action)) return
  const { before } = pended
  queryClient.setQueryData<Growth>(queryKeys.growth, (growth) =>
    growth === undefined ? growth : withdrawnGrowth(growth, action, before),
  )
}

export const rollBack = (queryClient: QueryClient, action: Action, pended: Pended | null | undefined) => {
  if (pended !== null && pended !== undefined) withdraw(queryClient, action, pended)
  void queryClient.invalidateQueries({ queryKey: isMeasurementAction(action) ? queryKeys.growth : queryKeys.today })
  if (isSwapping(action)) void queryClient.invalidateQueries(DAYS)
}

const refetchAfterSave = async (queryClient: QueryClient, queryKey: QueryKey) => {
  const { data, fetchStatus } = queryClient.getQueryState(queryKey) ?? {}
  if (data === undefined && fetchStatus === "fetching") await queryClient.cancelQueries({ queryKey })
  await queryClient.invalidateQueries({ queryKey })
}

export const settle = (queryClient: QueryClient, saved: Saved, action: Action) => {
  if (isMeasurementAction(action) && "measurement" in saved) {
    queryClient.setQueryData<Growth>(queryKeys.growth, (growth) =>
      growth === undefined ? growth : savedGrowth(growth, saved, action),
    )
  } else {
    queryClient.setQueryData<Today>(queryKeys.today, (today) =>
      today === undefined ? today : savedToday(today, saved, action),
    )
  }
  for (const queryKey of saved.changed) void refetchAfterSave(queryClient, queryKey)
}

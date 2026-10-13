import { type IsoWeek, queryKeys } from "@bt/contracts"
import { queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export const weekQuery = (api: HouseholdApi, week: IsoWeek) =>
  queryOptions({
    queryKey: queryKeys.week(week),
    queryFn: () => api.request((client) => client.periods.week({ params: { week } })),
  })

import { type LocalDate, queryKeys } from "@bt/contracts"
import { queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export const dayQuery = (api: HouseholdApi, date: LocalDate) =>
  queryOptions({
    queryKey: queryKeys.day(date),
    queryFn: () => api.request((client) => client.periods.day({ params: { date } })),
  })

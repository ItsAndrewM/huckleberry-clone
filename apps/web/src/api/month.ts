import { queryKeys, type YearMonth } from "@bt/contracts"
import { queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export const monthQuery = (api: HouseholdApi, month: YearMonth) =>
  queryOptions({
    queryKey: queryKeys.month(month),
    queryFn: () => api.request((client) => client.periods.month({ params: { month } })),
  })

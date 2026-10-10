import { queryKeys } from "@bt/contracts"
import { queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export const todayQuery = (api: HouseholdApi) =>
  queryOptions({ queryKey: queryKeys.today, queryFn: () => api.request((client) => client.today.today()) })

export const last24hQuery = (api: HouseholdApi) =>
  queryOptions({ queryKey: queryKeys.last24h, queryFn: () => api.request((client) => client.today.last24h()) })

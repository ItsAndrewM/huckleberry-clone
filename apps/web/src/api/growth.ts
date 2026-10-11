import { queryKeys } from "@bt/contracts"
import { queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export const growthQuery = (api: HouseholdApi) =>
  queryOptions({ queryKey: queryKeys.growth, queryFn: () => api.request((client) => client.growth.growth()) })

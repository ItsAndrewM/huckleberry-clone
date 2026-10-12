import { queryKeys } from "@bt/contracts"
import { queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

export const deletedQuery = (api: HouseholdApi) =>
  queryOptions({ queryKey: queryKeys.deleted, queryFn: () => api.request((client) => client.deleted.deleted()) })

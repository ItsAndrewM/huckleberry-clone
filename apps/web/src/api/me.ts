import { type Me, queryKeys } from "@bt/contracts"
import { type QueryClient, queryOptions } from "@tanstack/react-query"
import type { HouseholdApi } from "./client.ts"

const forgetOtherCaregiver = (queryClient: QueryClient) =>
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] })

export const meQuery = (api: HouseholdApi, queryClient: QueryClient) =>
  queryOptions({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const before = queryClient.getQueryData<Me>(queryKeys.me)
      const me = await api.request((client) => client.me.me())
      if (before !== undefined && before.caregiver.email !== me.caregiver.email) forgetOtherCaregiver(queryClient)
      return me
    },
  })

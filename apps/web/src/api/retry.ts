import type { UseQueryResult } from "@tanstack/react-query"

type Refetchable = Pick<UseQueryResult, "isFetching" | "refetch">

export interface Retry {
  readonly running: boolean
  readonly run: () => void
}

export const retryOf = (...queries: ReadonlyArray<Refetchable>): Retry => ({
  running: queries.some(({ isFetching }) => isFetching),
  run: () => {
    for (const { refetch } of queries) void refetch()
  },
})

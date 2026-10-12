import { type Me, queryKeys } from "@bt/contracts"
import type { QueryClient } from "@tanstack/react-query"

const PERIOD_PREFIXES = [["day"], ["week"], ["month"]]

export const refreshPeriodsOnZoneChange = (queryClient: QueryClient) => {
  const zoneOf = () => queryClient.getQueryData<Me>(queryKeys.me)?.household.timeZone
  let zone = zoneOf()
  queryClient.getQueryCache().subscribe(() => {
    const next = zoneOf()
    if (next === undefined || next === zone) return
    const moved = zone !== undefined
    zone = next
    if (moved) for (const queryKey of PERIOD_PREFIXES) void queryClient.invalidateQueries({ queryKey })
  })
}

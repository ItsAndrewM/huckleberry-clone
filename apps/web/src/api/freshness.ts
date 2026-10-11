import { QueryKey } from "@bt/contracts"
import type { QueryCache, QueryCacheNotifyEvent } from "@tanstack/react-query"
import { Schema } from "effect"
import type { ConnectivityStore } from "./connectivity.ts"

export interface Freshness {
  readonly updatedAt: () => number | null
  readonly subscribe: (listener: () => void) => () => void
}

const isHousehold = Schema.is(QueryKey)

const fallsBehind = (event: QueryCacheNotifyEvent) =>
  event.type === "updated" && (event.action.type === "invalidate" || event.action.type === "error")

const catchesUp = (event: QueryCacheNotifyEvent) =>
  event.type === "removed" ||
  (event.type === "updated" && event.action.type === "success" && event.action.manual !== true)

const earliest = (at: number | null, since: number | null | undefined) => {
  if (since === undefined) return at
  if (at === null || since === null) return null
  return Math.min(at, since)
}

export const trackFreshness = (
  cache: QueryCache,
  connectivity: Pick<ConnectivityStore, "lastHeard" | "subscribe">,
): Freshness => {
  const behindSince = new Map<string, number | null>()
  cache.subscribe((event) => {
    const { queryHash } = event.query
    if (catchesUp(event)) behindSince.delete(queryHash)
    else if (fallsBehind(event) && !behindSince.has(queryHash)) behindSince.set(queryHash, connectivity.lastHeard())
  })
  return {
    updatedAt: () => {
      const shown = cache
        .findAll({ type: "active" })
        .filter((query) => query.state.data !== undefined && isHousehold(query.queryKey))
      if (shown.length === 0) return null
      return shown.reduce<number | null>(
        (at, query) => earliest(at, behindSince.get(query.queryHash)),
        connectivity.lastHeard(),
      )
    },
    subscribe: (listener) => {
      const stopHearing = connectivity.subscribe(listener)
      const stopWatching = cache.subscribe(listener)
      return () => {
        stopHearing()
        stopWatching()
      }
    },
  }
}

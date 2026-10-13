import type { RecentEntry } from "@bt/contracts"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { cachedEntry } from "../../api/entry-cache.ts"

export const useCachedEntry = (id: string | null): RecentEntry | null => {
  const queryClient = useQueryClient()
  const [entry] = useState(() => (id === null ? null : cachedEntry(queryClient, id)))
  return entry
}

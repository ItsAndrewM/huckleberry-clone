import { useQuery } from "@tanstack/react-query"
import { useMe } from "../api/hooks.ts"
import { todayQuery } from "../api/today.ts"
import { useApp } from "../app-context.ts"
import type { SheetKind } from "./sending.ts"
import type { SheetsState } from "./sheets-state.ts"

const TODAY_SHEETS = new Set<SheetKind>(["diaper", "bottle", "nursing", "pastFeed"])

export const useReopenWhenReady = (state: SheetsState, reopen: () => void) => {
  const { api } = useApp()
  const waiting = state.open === null ? (state.held[0]?.sending.sheet ?? null) : null
  const needsToday = waiting !== null && TODAY_SHEETS.has(waiting)
  const { data: me } = useMe()
  const { data: today } = useQuery({ ...todayQuery(api), enabled: needsToday })
  if (waiting !== null && me !== undefined && (!needsToday || today !== undefined)) reopen()
}

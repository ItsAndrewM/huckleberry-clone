import type { LocalDate } from "@bt/contracts"
import type { HistorySearch } from "../history/history-date.ts"

export const historySearchOf = (date: LocalDate, today: LocalDate): HistorySearch => (date === today ? {} : { date })

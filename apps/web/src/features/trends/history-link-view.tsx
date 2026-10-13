import type { LocalDate } from "@bt/contracts"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
import { historySearchOf } from "./history-link.ts"

export const HistoryLink = ({ date, today }: { readonly date: LocalDate; readonly today: LocalDate }) => (
  <Link
    to="/history"
    search={historySearchOf(date, today)}
    className="flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
  >
    Open in History
    <ChevronRightIcon aria-hidden="true" className="size-4" />
  </Link>
)

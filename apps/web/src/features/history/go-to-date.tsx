import type { LocalDate } from "@bt/contracts"
import { useId } from "react"
import { Input } from "../../components/ui/input.tsx"
import { dateInSearch } from "./history-date.ts"

interface GoToDateProps {
  readonly shown: LocalDate
  readonly earliest: LocalDate
  readonly latest: LocalDate
  readonly onPick: (date: LocalDate) => void
}

const focusOnOpen = (node: HTMLInputElement | null) => node?.focus()

export const GoToDate = ({ shown, earliest, latest, onPick }: GoToDateProps) => {
  const id = useId()
  return (
    <div className="flex flex-col gap-2 pt-1">
      <label htmlFor={id} className="text-sm font-medium">
        Go to
      </label>
      <Input
        ref={focusOnOpen}
        id={id}
        type="date"
        min={earliest}
        max={latest}
        defaultValue={shown}
        onChange={(event) => {
          const date = dateInSearch(event.target.value)
          if (date !== undefined && earliest <= date && date <= latest) onPick(date)
        }}
      />
    </div>
  )
}

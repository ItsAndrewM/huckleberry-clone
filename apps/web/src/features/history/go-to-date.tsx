import type { LocalDate } from "@bt/contracts"
import { useId, useRef } from "react"
import { Input } from "../../components/ui/input.tsx"
import { editsDateText, pickedDate } from "./history-date.ts"

interface GoToDateProps {
  readonly shown: LocalDate
  readonly earliest: LocalDate
  readonly latest: LocalDate
  readonly onPick: (date: LocalDate) => void
  readonly onClose: () => void
}

const focusOnOpen = (node: HTMLInputElement | null) => node?.focus()

export const GoToDate = ({ shown, earliest, latest, onPick, onClose }: GoToDateProps) => {
  const id = useId()
  const typing = useRef(false)
  const pick = (value: string) => {
    typing.current = false
    const date = pickedDate(value, earliest, latest)
    if (date !== undefined) onPick(date)
  }
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
          if (!typing.current) pick(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            pick(event.currentTarget.value)
          } else if (event.key === "Escape") {
            event.preventDefault()
            typing.current = false
            onClose()
          } else if (editsDateText(event.key)) typing.current = true
        }}
        onBlur={(event) => {
          if (typing.current) pick(event.currentTarget.value)
        }}
        onPointerDown={() => {
          typing.current = false
        }}
      />
    </div>
  )
}

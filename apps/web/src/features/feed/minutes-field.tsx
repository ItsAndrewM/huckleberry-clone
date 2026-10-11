import { useId, useState } from "react"
import { Input } from "../../components/ui/input.tsx"
import { MAX_SIDE_MINUTES } from "./past-feed.ts"

interface MinutesFieldProps {
  readonly label: string
  readonly minutes: number | null
  readonly onChange: (minutes: number | null) => void
}

const parsedMinutes = (text: string): number | null => {
  const minutes = text.trim() === "" ? 0 : Number(text)
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_SIDE_MINUTES ? minutes : null
}

export const MinutesField = ({ label, minutes, onChange }: MinutesFieldProps) => {
  const id = useId()
  const [text, setText] = useState(() => String(minutes ?? 0))
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-base font-medium">
        {label}
      </label>
      <span className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          className="w-20 text-center text-lg tabular-nums"
          value={text}
          aria-invalid={minutes === null}
          onChange={(event) => {
            setText(event.target.value)
            onChange(parsedMinutes(event.target.value))
          }}
        />
        <span className="w-9 text-sm text-muted-foreground">min</span>
      </span>
    </div>
  )
}

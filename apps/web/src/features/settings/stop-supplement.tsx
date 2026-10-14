import { type MouseEvent, useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { stopQuestion } from "./supplement-fields.ts"

interface StopSupplementProps {
  readonly name: string
  readonly stopped: boolean
  readonly disabled: boolean
  readonly onChange: (form: HTMLFormElement) => void
}

const focusOnArrival = (button: HTMLButtonElement | null) => button?.focus()

export const StopSupplement = ({ name, stopped, disabled, onChange }: StopSupplementProps) => {
  const [asked, setAsked] = useState(false)
  const change = ({ currentTarget }: MouseEvent<HTMLButtonElement>) => {
    if (currentTarget.form !== null) onChange(currentTarget.form)
  }
  if (stopped || !asked) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={disabled}
        onClick={stopped ? change : () => setAsked(true)}
      >
        {stopped ? "Give it again" : "Stop giving it"}
      </Button>
    )
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border p-3">
      <p className="text-sm">{stopQuestion(name)}</p>
      <div className="flex gap-2">
        <Button type="button" variant="destructive" size="lg" className="flex-1" disabled={disabled} onClick={change}>
          Stop
        </Button>
        <Button
          ref={focusOnArrival}
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => setAsked(false)}
        >
          Keep giving it
        </Button>
      </div>
    </div>
  )
}

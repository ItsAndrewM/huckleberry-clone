import { Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Button } from "../components/ui/button.tsx"

interface DeleteEntryProps {
  readonly noun: string
  readonly emptied: string | null
  readonly disabled?: boolean
  readonly onDelete: () => void
}

const focusOnArrival = (button: HTMLButtonElement | null) => button?.focus()

export const DeleteEntry = ({ noun, emptied, disabled = false, onDelete }: DeleteEntryProps) => {
  const [asked, setAsked] = useState(false)
  if (!asked && emptied === null) {
    return (
      <Button
        variant="ghost"
        size="lg"
        className="text-destructive"
        disabled={disabled}
        focusableWhenDisabled
        onClick={() => setAsked(true)}
      >
        <Trash2Icon aria-hidden="true" />
        Delete {noun}
      </Button>
    )
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border p-3">
      <p className="text-sm">{emptied === null ? `Delete this ${noun}?` : `${emptied} Delete this ${noun}?`}</p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="lg"
          className="flex-1"
          disabled={disabled}
          focusableWhenDisabled
          onClick={onDelete}
        >
          Delete
        </Button>
        <Button
          ref={focusOnArrival}
          hidden={emptied !== null}
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => setAsked(false)}
        >
          Keep it
        </Button>
      </div>
    </div>
  )
}

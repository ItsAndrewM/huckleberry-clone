import type { VolumeUnit } from "@bt/contracts"
import { MinusIcon, PlusIcon } from "lucide-react"
import { useId, useState } from "react"
import type { MessageLink } from "../../components/field-message.tsx"
import { Button } from "../../components/ui/button.tsx"
import { Input } from "../../components/ui/input.tsx"
import { amountText, parsedAmount, stepped, UNIT_LABELS } from "./amounts.ts"

interface AmountFieldProps {
  readonly label: string
  readonly ml: number | null
  readonly unit: VolumeUnit
  readonly onChange: (ml: number | null) => void
  readonly describedBy?: MessageLink | undefined
}

export const AmountField = ({ label, ml, unit, onChange, describedBy }: AmountFieldProps) => {
  const id = useId()
  const [text, setText] = useState(() => amountText(ml ?? 0, unit))
  const step = (steps: number) => {
    const next = stepped(ml ?? 0, unit, steps)
    setText(amountText(next, unit))
    onChange(next)
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-base font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-lg" aria-label={`Less ${label.toLowerCase()}`} onClick={() => step(-1)}>
          <MinusIcon aria-hidden="true" />
        </Button>
        <Input
          id={id}
          inputMode="decimal"
          className="w-20 text-center text-lg tabular-nums"
          value={text}
          aria-invalid={ml === null || describedBy?.invalid === true}
          aria-describedby={describedBy?.id}
          onChange={(event) => {
            setText(event.target.value)
            onChange(parsedAmount(event.target.value, unit))
          }}
        />
        <span className="w-9 text-sm text-muted-foreground">{UNIT_LABELS[unit]}</span>
        <Button variant="outline" size="icon-lg" aria-label={`More ${label.toLowerCase()}`} onClick={() => step(1)}>
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

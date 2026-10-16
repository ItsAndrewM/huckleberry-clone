import { useId, useState } from "react"
import { FieldMessage, type MessageLink } from "../../components/field-message.tsx"
import { Input } from "../../components/ui/input.tsx"
import { NUMBER_MESSAGES } from "../../number-messages.ts"
import { minutesFromText, minutesIssue } from "./past-feed.ts"

interface MinutesFieldProps {
  readonly label: string
  readonly minutes: number | null
  readonly onChange: (minutes: number | null) => void
  readonly describedBy?: MessageLink | undefined
}

export const MinutesField = ({ label, minutes, onChange, describedBy }: MinutesFieldProps) => {
  const id = useId()
  const messageId = useId()
  const [text, setText] = useState(() => String(minutes ?? 0))
  const issue = minutesIssue(text)
  return (
    <div className="flex flex-col gap-2">
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
            aria-invalid={minutes === null || describedBy?.invalid === true}
            aria-describedby={describedBy === undefined ? messageId : `${messageId} ${describedBy.id}`}
            onChange={(event) => {
              setText(event.target.value)
              onChange(minutesFromText(event.target.value))
            }}
          />
          <span className="w-9 text-sm text-muted-foreground">min</span>
        </span>
      </div>
      <FieldMessage id={messageId}>{issue === null ? null : NUMBER_MESSAGES[issue]}</FieldMessage>
    </div>
  )
}

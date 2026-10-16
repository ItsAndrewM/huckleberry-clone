import { type Ref, useId, useState } from "react"
import { FieldMessage, type MessageLink } from "../components/field-message.tsx"
import { Button } from "../components/ui/button.tsx"
import { Input } from "../components/ui/input.tsx"
import { focusFollowsSwap } from "../shell/focus-hand-off.ts"
import { AmbiguityChoice } from "./ambiguity-choice.tsx"
import { NOW, resolveWhen, type When, type WhenIssue, whenAt } from "./when.ts"

interface WhenFieldProps {
  readonly label: string
  readonly when: When
  readonly onChange: (when: When) => void
  readonly zone: string
  readonly now: number
  readonly earliest?: number | undefined
  readonly tooEarly?: string
  readonly describedBy?: MessageLink | undefined
}

const MESSAGES = {
  unreadable: "Pick a date and time.",
  nonexistent: "That time didn't happen: the clocks went forward.",
  ambiguous: "",
  in_future: "That's in the future.",
  too_early: "That's before this side started.",
} satisfies Record<WhenIssue, string>

interface NowRowProps {
  readonly label: string
  readonly onChange: () => void
  readonly ref: Ref<HTMLDivElement>
}

const NowRow = ({ label, onChange, ref }: NowRowProps) => (
  <div ref={ref} className="flex items-center justify-between gap-3">
    <span className="text-sm font-medium">{label}</span>
    <span className="flex items-center gap-1">
      <span className="text-base">Now</span>
      <Button variant="ghost" size="lg" aria-label={`Change, ${label}`} onClick={onChange}>
        Change
      </Button>
    </span>
  </div>
)

export const WhenField = ({ label, when, onChange, zone, now, earliest, tooEarly, describedBy }: WhenFieldProps) => {
  const [followsSwap] = useState(focusFollowsSwap)
  const messageId = useId()
  const questionId = useId()
  if (when.kind === "now") {
    return <NowRow ref={followsSwap} label={label} onChange={() => onChange(whenAt(now, zone))} />
  }
  const resolved = resolveWhen(when, zone, now, earliest)
  const messages = tooEarly === undefined ? MESSAGES : { ...MESSAGES, too_early: tooEarly }
  const message = resolved.ok ? "" : messages[resolved.issue]
  return (
    <div ref={followsSwap} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-auto flex-col gap-2 text-sm font-medium">
          {label}
          <Input
            type="datetime-local"
            step={60}
            value={when.local}
            aria-invalid={message !== "" || describedBy?.invalid === true}
            aria-describedby={[messageId, questionId, describedBy?.id].filter((id) => id !== undefined).join(" ")}
            onChange={(event) => onChange({ kind: "at", local: event.target.value, pick: null })}
          />
        </label>
        <Button variant="outline" size="lg" className="ml-auto" onClick={() => onChange(NOW)}>
          Now
        </Button>
      </div>
      <AmbiguityChoice id={questionId} when={when} zone={zone} onChange={onChange} />
      <FieldMessage id={messageId}>{message}</FieldMessage>
    </div>
  )
}

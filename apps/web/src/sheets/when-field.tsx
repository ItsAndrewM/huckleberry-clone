import { Button } from "../components/ui/button.tsx"
import { Input } from "../components/ui/input.tsx"
import { AmbiguityChoice } from "./ambiguity-choice.tsx"
import { NOW, resolveWhen, type When, type WhenIssue, whenAt } from "./when.ts"

interface WhenFieldProps {
  readonly label: string
  readonly when: When
  readonly onChange: (when: When) => void
  readonly zone: string
  readonly now: number
  readonly earliest?: number | undefined
}

const MESSAGES = {
  unreadable: "Pick a date and time.",
  nonexistent: "That time didn't happen: the clocks went forward.",
  ambiguous: "",
  in_future: "That's in the future.",
  too_early: "That's before this side started.",
} satisfies Record<WhenIssue, string>

const NowRow = ({ label, onChange }: { readonly label: string; readonly onChange: () => void }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm font-medium">{label}</span>
    <span className="flex items-center gap-1">
      <span className="text-base">Now</span>
      <Button variant="ghost" size="lg" onClick={onChange}>
        Change
      </Button>
    </span>
  </div>
)

export const WhenField = ({ label, when, onChange, zone, now, earliest }: WhenFieldProps) => {
  if (when.kind === "now") return <NowRow label={label} onChange={() => onChange(whenAt(now, zone))} />
  const resolved = resolveWhen(when, zone, now, earliest)
  const message = resolved.ok ? "" : MESSAGES[resolved.issue]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium">
          {label}
          <Input
            type="datetime-local"
            step={60}
            value={when.local}
            onChange={(event) => onChange({ kind: "at", local: event.target.value, pick: null })}
          />
        </label>
        <Button variant="outline" size="lg" onClick={() => onChange(NOW)}>
          Now
        </Button>
      </div>
      <AmbiguityChoice when={when} zone={zone} onChange={onChange} />
      {message === "" ? null : <p className="text-sm text-destructive">{message}</p>}
    </div>
  )
}

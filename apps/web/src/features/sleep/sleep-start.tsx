import type { Sleep } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { clockOf } from "../../sheets/clock.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { resolveWhen, sameWhen, type When, whenAt } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { runningEdit } from "./sleep-state.ts"

interface SleepStartProps {
  readonly sleep: Sleep
  readonly zone: string
  readonly busy: boolean
}

export const SleepStart = ({ sleep, zone, busy }: SleepStartProps) => {
  const sheets = useSheets()
  const now = useNow()
  const [when, setWhen] = useState<When | null>(null)
  if (when === null) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Fell asleep</span>
        <span className="flex items-center gap-1">
          <span className="text-base tabular-nums">{clockOf(sleep.startedAt, zone)}</span>
          <Button
            variant="ghost"
            size="lg"
            aria-label="Change, Fell asleep"
            disabled={busy}
            focusableWhenDisabled
            onClick={() => setWhen(whenAt(sleep.startedAt, zone))}
          >
            Change
          </Button>
        </span>
      </div>
    )
  }
  const changed = !sameWhen(when, whenAt(sleep.startedAt, zone))
  const save = () => {
    const resolved = resolveWhen(when, zone, tapTime())
    if (!resolved.ok) return
    sheets.send({ sheet: "sleep", action: runningEdit(sleep, sleep.kind, resolved.instant) })
    setWhen(null)
  }
  return (
    <div className="flex flex-col gap-2">
      <WhenField label="Fell asleep" when={when} onChange={setWhen} zone={zone} now={now} />
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" disabled={busy || !changed || !resolveWhen(when, zone, now).ok} onClick={save}>
          Save start
        </Button>
        <Button variant="ghost" size="lg" onClick={() => setWhen(null)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

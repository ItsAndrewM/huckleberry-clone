import type { Feed } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { clockOf } from "../../sheets/clock.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { type When, whenAt } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { firstSideOf, startAction, startChanged, startedAtOf } from "./nursing-state.ts"

interface FeedStartProps {
  readonly feed: Feed
  readonly zone: string
  readonly busy: boolean
}

export const FeedStart = ({ feed, zone, busy }: FeedStartProps) => {
  const sheets = useSheets()
  const now = useNow()
  const [when, setWhen] = useState<When | null>(null)
  const first = firstSideOf(feed)
  if (first === undefined) return null
  if (when === null) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Started</span>
        <span className="flex items-center gap-1">
          <span className="text-base tabular-nums">{clockOf(first.startedAt, zone)}</span>
          <Button variant="ghost" size="lg" disabled={busy} onClick={() => setWhen(whenAt(first.startedAt, zone))}>
            Change
          </Button>
        </span>
      </div>
    )
  }
  const fits = (at: number, latest: number) => at < (first.endedAt ?? latest)
  const changed = startChanged(first, when, zone)
  const picked = startedAtOf(first, when, zone, now)
  const tooLate = changed && picked.ok && !fits(picked.instant, now)
  const save = () => {
    const tap = tapTime()
    const resolved = startedAtOf(first, when, zone, tap)
    if (!resolved.ok || !fits(resolved.instant, tap)) return
    sheets.send({ sheet: "nursing", action: startAction(feed, first, resolved.instant) })
    setWhen(null)
  }
  return (
    <div className="flex flex-col gap-2">
      <WhenField label="Started" when={when} onChange={setWhen} zone={zone} now={now} />
      {tooLate ? (
        <p className="text-sm text-destructive">
          {first.endedAt === null ? "That's in the future." : "That's after this side ended."}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" disabled={busy || !changed || !picked.ok || tooLate} onClick={save}>
          Save start
        </Button>
        <Button variant="ghost" size="lg" onClick={() => setWhen(null)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

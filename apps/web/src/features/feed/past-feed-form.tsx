import type { VolumeUnit } from "@bt/contracts"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { resolveWhen } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { AmountField } from "./amount-field.tsx"
import { FirstSide } from "./first-side.tsx"
import { MinutesField } from "./minutes-field.tsx"
import { isComplete, pastFeedEntry, pastFeedSession } from "./past-feed.ts"

interface PastFeedFormProps {
  readonly unit: VolumeUnit
  readonly zone: string
}

export const PastFeedForm = ({ unit, zone }: PastFeedFormProps) => {
  const sheets = useSheets()
  const now = useNow()
  const [session] = useState(() => pastFeedSession(failedFor(sheets, "pastFeed"), now, zone))
  const [when, setWhen] = useState(session.when)
  const [feed, setFeed] = useState(() => ({
    first: session.first,
    minutes: session.minutes,
    breastMilkMl: session.breastMilkMl,
    formulaMl: session.formulaMl,
  }))
  const save = () => {
    const resolved = resolveWhen(when, zone, tapTime())
    if (!resolved.ok || !isComplete(feed)) return
    const payload = pastFeedEntry(session.actionId, resolved.instant, feed)
    sheets.send({ sheet: "pastFeed", action: { kind: "logFeed", payload } })
  }
  return (
    <>
      <WhenField label="Started" when={when} onChange={setWhen} zone={zone} now={now} />
      <FirstSide side={feed.first} onChange={(first) => setFeed({ ...feed, first })} />
      <MinutesField
        label="Left"
        minutes={feed.minutes.left}
        onChange={(left) => setFeed({ ...feed, minutes: { ...feed.minutes, left } })}
      />
      <MinutesField
        label="Right"
        minutes={feed.minutes.right}
        onChange={(right) => setFeed({ ...feed, minutes: { ...feed.minutes, right } })}
      />
      <AmountField
        label="Breast milk"
        ml={feed.breastMilkMl}
        unit={unit}
        onChange={(breastMilkMl) => setFeed({ ...feed, breastMilkMl })}
      />
      <AmountField
        label="Formula"
        ml={feed.formulaMl}
        unit={unit}
        onChange={(formulaMl) => setFeed({ ...feed, formulaMl })}
      />
      <Button
        size="lg"
        className="h-14 text-lg"
        disabled={!isComplete(feed) || !resolveWhen(when, zone, now).ok}
        onClick={save}
      >
        Save
      </Button>
      <FailureNote sheet="pastFeed" />
    </>
  )
}

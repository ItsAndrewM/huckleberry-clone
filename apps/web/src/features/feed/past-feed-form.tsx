import type { VolumeUnit } from "@bt/contracts"
import { useId, useState } from "react"
import { FieldMessage } from "../../components/field-message.tsx"
import { Button } from "../../components/ui/button.tsx"
import { clockOf } from "../../sheets/clock.ts"
import { FailureNote } from "../../sheets/failure-note.tsx"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { WhenField } from "../../sheets/when-field.tsx"
import { resolveWhen } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { AmountField } from "./amount-field.tsx"
import { FirstSide } from "./first-side.tsx"
import { MinutesField } from "./minutes-field.tsx"
import { canSavePastFeed, futureEnd, pastFeedEntry, pastFeedSession } from "./past-feed.ts"

interface PastFeedFormProps {
  readonly unit: VolumeUnit
  readonly zone: string
}

export const PastFeedForm = ({ unit, zone }: PastFeedFormProps) => {
  const sheets = useSheets()
  const now = useNow()
  const [session] = useState(() => pastFeedSession(failedFor(sheets, "pastFeed"), now, zone, sheets.at))
  const [when, setWhen] = useState(session.when)
  const [feed, setFeed] = useState(() => ({
    first: session.first,
    minutes: session.minutes,
    breastMilkMl: session.breastMilkMl,
    formulaMl: session.formulaMl,
  }))
  const endsLateId = useId()
  const endsAt = futureEnd(feed, when, zone, now)
  const endsLate = { id: endsLateId, invalid: endsAt !== null }
  const save = () => {
    if (sheets.open !== "pastFeed") return
    const at = tapTime()
    const resolved = resolveWhen(when, zone, at)
    if (!resolved.ok || !canSavePastFeed(feed, when, zone, at)) return
    const payload = pastFeedEntry(session.actionId, resolved.instant, feed)
    sheets.send({ sheet: "pastFeed", action: { kind: "logFeed", payload } })
  }
  return (
    <>
      <FailureNote sheet="pastFeed" />
      <WhenField label="Started" when={when} onChange={setWhen} zone={zone} now={now} describedBy={endsLate} />
      <FirstSide side={feed.first} onChange={(first) => setFeed({ ...feed, first })} />
      <MinutesField
        label="Left"
        minutes={feed.minutes.left}
        onChange={(left) => setFeed({ ...feed, minutes: { ...feed.minutes, left } })}
        describedBy={endsLate}
      />
      <MinutesField
        label="Right"
        minutes={feed.minutes.right}
        onChange={(right) => setFeed({ ...feed, minutes: { ...feed.minutes, right } })}
        describedBy={endsLate}
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
      <FieldMessage id={endsLateId}>
        {endsAt === null ? null : `That would end at ${clockOf(endsAt, zone)}, in the future.`}
      </FieldMessage>
      <Button size="lg" className="h-14 text-lg" disabled={!canSavePastFeed(feed, when, zone, now)} onClick={save}>
        Save
      </Button>
    </>
  )
}

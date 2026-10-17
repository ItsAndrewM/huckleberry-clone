import { useId } from "react"
import { FieldMessage } from "../../components/field-message.tsx"
import { WhenField } from "../../sheets/when-field.tsx"
import type { Resolved } from "../../sheets/when.ts"
import { type SleepSpan, type SleepTimes, wokeAfter } from "./past-sleep.ts"
import { AFTER_SLEEP } from "./sleep-session.ts"

interface SleepTimesFieldsProps {
  readonly times: SleepTimes
  readonly start: Resolved
  readonly span: SleepSpan
  readonly zone: string
  readonly now: number
  readonly onChange: (times: SleepTimes) => void
}

export const SleepTimesFields = ({ times, start, span, zone, now, onChange }: SleepTimesFieldsProps) => {
  const tooLongId = useId()
  const tooLong = !span.ok && span.tooLong
  const describedBy = { id: tooLongId, invalid: tooLong }
  return (
    <>
      <WhenField
        label="Fell asleep"
        when={times.fellAsleep}
        onChange={(fellAsleep) => onChange({ ...times, fellAsleep })}
        zone={zone}
        now={now}
        describedBy={describedBy}
      />
      <WhenField
        label="Woke"
        when={times.woke}
        onChange={(woke) => onChange({ ...times, woke })}
        zone={zone}
        now={now}
        earliest={wokeAfter(start)}
        tooEarly={AFTER_SLEEP}
        describedBy={describedBy}
      />
      <FieldMessage id={tooLongId}>{tooLong ? "A sleep can last a day at most." : null}</FieldMessage>
    </>
  )
}

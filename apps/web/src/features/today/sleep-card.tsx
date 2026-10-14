import type { Today } from "@bt/contracts"
import { formatElapsed, sleepElapsed } from "@bt/domain"
import { clockTime } from "../../clock-time.ts"
import type { Display } from "./display.ts"
import { formatMinutes, formatSince } from "./format.ts"
import { LiveDot } from "./live-dot.tsx"
import { SLEEP_TITLES } from "./sleep-parts.ts"
import { sleepStatus } from "./sleep-status.ts"
import { StatusCard } from "./status-card.tsx"

interface SleepCardProps {
  readonly today: Today
  readonly display: Display
  readonly now: number
}

export const SleepCard = ({ today, display, now }: SleepCardProps) => {
  const status = sleepStatus(today, now)
  const at = (instant: number) => clockTime(instant, display.timeZone, display.locale)
  switch (status.kind) {
    case "asleep":
      return (
        <StatusCard
          label={
            <>
              <LiveDot />
              Asleep now · {SLEEP_TITLES[status.sleep.kind]}
            </>
          }
          value={formatElapsed(status.seconds)}
          detail={[`Fell asleep ${at(status.sleep.startedAt)}`]}
          running
        />
      )
    case "awake":
      return (
        <StatusCard
          label="Since she woke"
          value={formatSince(status.seconds)}
          detail={[
            `Woke ${at(status.wokeAt)}`,
            `${SLEEP_TITLES[status.sleep.kind]} ${formatMinutes(sleepElapsed(status.sleep, now))}`,
          ]}
        />
      )
    case "none":
      return <StatusCard label="No sleeps yet" detail={["The first sleep you log will show here."]} />
  }
}

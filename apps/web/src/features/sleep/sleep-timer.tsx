import type { Sleep } from "@bt/contracts"
import { formatElapsed, sleepElapsed } from "@bt/domain"
import { SLEEP_TITLES } from "../today/sleep-parts.ts"

interface SleepTimerProps {
  readonly sleep: Sleep
  readonly now: number
}

export const SleepTimer = ({ sleep, now }: SleepTimerProps) => (
  <div className="flex flex-col items-center gap-1 py-2">
    <p role="timer" className="text-6xl font-semibold tracking-tight text-primary tabular-nums">
      {formatElapsed(sleepElapsed(sleep, now))}
    </p>
    <p className="text-sm text-muted-foreground">
      <span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full bg-primary motion-safe:animate-pulse" />
      Asleep · {SLEEP_TITLES[sleep.kind]}
    </p>
  </div>
)

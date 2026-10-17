import type { Feed } from "@bt/contracts"
import { feedSummary, formatElapsed } from "@bt/domain"
import { useId } from "react"

interface FeedTimerProps {
  readonly feed: Feed
  readonly now: number
  readonly status: string
  readonly running: boolean
}

export const FeedTimer = ({ feed, now, status, running }: FeedTimerProps) => {
  const statusId = useId()
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <p
        role="timer"
        aria-describedby={statusId}
        className="text-6xl font-semibold tracking-tight text-primary tabular-nums"
      >
        {formatElapsed(feedSummary(feed, now).nursingSeconds)}
      </p>
      <p id={statusId} className="text-sm text-muted-foreground">
        {running ? (
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-2 rounded-full bg-primary motion-safe:animate-pulse"
          />
        ) : null}
        {status}
      </p>
    </div>
  )
}

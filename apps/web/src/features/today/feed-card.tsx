import type { Today } from "@bt/contracts"
import { formatElapsed } from "@bt/domain"
import type { Display } from "./display.ts"
import { feedParts } from "./feed-parts.ts"
import { feedStatus } from "./feed-status.ts"
import { clockTime, formatSince } from "./format.ts"
import { StatusCard } from "./status-card.tsx"

interface FeedCardProps {
  readonly today: Today
  readonly display: Display
  readonly now: number
}

const SIDES = { left: "Left", right: "Right" } as const

const LiveDot = () => <span aria-hidden="true" className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />

export const FeedCard = ({ today, display, now }: FeedCardProps) => {
  const status = feedStatus(today, now)
  const at = (instant: number) => clockTime(instant, display.timeZone, display.locale)
  switch (status.kind) {
    case "running":
      return (
        <StatusCard
          label={
            <>
              <LiveDot />
              Feeding now · {SIDES[status.side]} side
            </>
          }
          value={formatElapsed(status.nursingSeconds)}
          detail={[`Started ${at(status.feed.startedAt)}`]}
          running
        />
      )
    case "paused":
      return (
        <StatusCard
          label="Feed paused"
          value={formatElapsed(status.nursingSeconds)}
          detail={[`Started ${at(status.feed.startedAt)}`]}
        />
      )
    case "since":
      return (
        <StatusCard
          label="Since last feed started"
          value={formatSince(status.seconds)}
          detail={[at(status.feed.startedAt), ...feedParts(status.feed, display.volume, now)]}
        />
      )
    case "none":
      return <StatusCard label="No feeds yet" detail={["The first feed you log will show here."]} />
  }
}

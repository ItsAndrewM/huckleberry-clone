import type { PlacedBlock, Side } from "@bt/domain"
import { cn } from "cn"
import { showsLength } from "./entry-labels.ts"
import { atStep, inLane, stepsTall } from "./grid-classes.ts"

interface SleepBlockProps {
  readonly block: PlacedBlock<Side>
  readonly title: string
  readonly length: string
  readonly name: string
  readonly onOpen: () => void
}

export const SleepBlock = ({ block, title, length, name, onOpen }: SleepBlockProps) => (
  <button
    type="button"
    aria-label={name}
    onClick={onOpen}
    className={cn(
      "group pointer-events-auto absolute px-0.5 text-left outline-none focus-visible:z-20",
      atStep(block.top),
      stepsTall(block.height),
      inLane(block.lane, block.lanes),
    )}
  >
    <span
      className={cn(
        "block size-full overflow-hidden rounded-md border border-muted-foreground/35 bg-muted-foreground/15",
        "group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
        block.startsBefore && "rounded-t-none border-t-0",
        block.endsAfter && "rounded-b-none border-b-0",
      )}
    >
      <span className="block truncate text-[0.6875rem] leading-4 font-medium">{title}</span>
      {showsLength(block.height) ? (
        <span className="block truncate text-[0.6875rem] leading-4 text-muted-foreground tabular-nums">{length}</span>
      ) : null}
    </span>
  </button>
)

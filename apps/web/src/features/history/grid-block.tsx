import type { PlacedBlock, Side } from "@bt/domain"
import { cn } from "cn"
import { atStep, inLane, stepsTall } from "./grid-classes.ts"

interface GridBlockProps {
  readonly block: PlacedBlock<Side>
  readonly text: string
  readonly name: string
  readonly onOpen: () => void
}

const SIDE_FILL = { left: "bg-primary/40", right: "bg-primary/20" } as const satisfies Record<Side, string>

export const GridBlock = ({ block, text, name, onOpen }: GridBlockProps) => (
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
        "relative block size-full overflow-hidden rounded-md border border-primary/45 bg-card",
        "group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
        block.startsBefore && "rounded-t-none border-t-0",
        block.endsAfter && "rounded-b-none border-b-0",
      )}
    >
      {block.bands.map((band) => (
        <span
          key={`${band.kind}-${band.top}`}
          aria-hidden="true"
          className={cn("absolute inset-x-0", SIDE_FILL[band.kind], atStep(band.top), stepsTall(band.height))}
        />
      ))}
      <span className="relative block truncate px-1.5 text-[0.6875rem] leading-4 font-medium">{text}</span>
    </span>
  </button>
)

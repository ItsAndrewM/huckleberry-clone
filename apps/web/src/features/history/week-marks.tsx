import type { PlacedBlock, PlacedCluster, Side } from "@bt/domain"
import { cn } from "cn"
import { atStep, inLane, stepsTall } from "./grid-classes.ts"
import type { WeekColumn } from "./week-model.ts"

const SIDE_FILL = { left: "bg-primary/45", right: "bg-primary/20" } as const satisfies Record<Side, string>

const Bar = ({ block }: { readonly block: PlacedBlock<Side> }) => (
  <span
    className={cn(
      "absolute overflow-hidden rounded-[3px] border border-primary/65 bg-card",
      atStep(block.top),
      stepsTall(block.height),
      inLane(block.lane, block.lanes),
      block.startsBefore && "rounded-t-none border-t-0",
      block.endsAfter && "rounded-b-none border-b-0",
    )}
  >
    {block.bands.map((band) => (
      <span
        key={`${band.kind}-${band.top}`}
        className={cn("absolute inset-x-0", SIDE_FILL[band.kind], atStep(band.top), stepsTall(band.height))}
      />
    ))}
  </span>
)

const Dots = ({
  clusters,
  className,
}: {
  readonly clusters: ReadonlyArray<PlacedCluster>
  readonly className: string
}) =>
  clusters.map((cluster) => (
    <span
      key={cluster.ids.join()}
      className={cn("absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full", className, atStep(cluster.top))}
    />
  ))

const Stripe = ({ block }: { readonly block: PlacedBlock<Side> }) => (
  <span
    data-kind="sleep"
    className={cn(
      "absolute inset-x-0 rounded-[2px] bg-muted-foreground/70",
      atStep(block.top),
      stepsTall(block.height),
      block.startsBefore && "rounded-t-none",
      block.endsAfter && "rounded-b-none",
    )}
  />
)

export const WeekMarks = ({ column }: { readonly column: WeekColumn }) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0">
    <div className="absolute inset-y-0 left-0.5 w-[9%]">
      {column.sleeps.map((block) => (
        <Stripe key={block.id} block={block} />
      ))}
    </div>
    <div className="absolute inset-y-0 left-[14%] w-[36%]">
      {column.grid.blocks.map((block) => (
        <Bar key={block.id} block={block} />
      ))}
    </div>
    <div className="absolute inset-y-0 left-[51%] w-[15%]">
      <Dots clusters={column.grid.clusters} className="bg-primary" />
    </div>
    <div className="absolute inset-y-0 left-[67%] w-[15%]">
      <Dots clusters={column.diapers} className="bg-foreground/55" />
    </div>
    <div className="absolute inset-y-0 left-[83%] w-[15%]">
      <Dots clusters={column.doses} className="border border-primary bg-card" />
    </div>
    {column.grid.now === null ? null : (
      <>
        <span className={cn("absolute inset-x-0 bottom-0 bg-muted/70", atStep(column.grid.now))} />
        <span className={cn("absolute inset-x-0 border-t-2 border-primary", atStep(column.grid.now))} />
      </>
    )}
  </div>
)

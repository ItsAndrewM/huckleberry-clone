import { cn } from "cn"
import { LayersIcon } from "lucide-react"
import type { Display } from "../today/display.ts"
import { KIND_ICONS } from "../today/kind-icons.ts"
import { anchorOf, type DayModel } from "./day-model.ts"
import { blockText, entryName } from "./entry-labels.ts"
import { GridBlock } from "./grid-block.tsx"
import { atStep, stepsTall } from "./grid-classes.ts"
import { GridMarker } from "./grid-marker.tsx"
import { markersOf } from "./grid-markers.ts"
import { HourRows } from "./hour-rows.tsx"

interface DayGridProps {
  readonly model: DayModel
  readonly display: Display
  readonly now: number
  readonly onOpen: (ids: ReadonlyArray<string>) => void
}

const MARKER_ICONS = { bottle: KIND_ICONS.bottle, diaper: KIND_ICONS.diaper, several: LayersIcon } as const

const scrollIntoMiddle = (node: HTMLDivElement | null) => node?.scrollIntoView({ block: "center" })

export const DayGrid = ({ model, display, now, onOpen }: DayGridProps) => {
  const { grid } = model
  return (
    <section aria-label="The day by hour" className={cn("relative mt-2 mb-4 [--cal-step:5px]", stepsTall(grid.steps))}>
      <div ref={scrollIntoMiddle} aria-hidden="true" className={cn("absolute", atStep(anchorOf(model)))} />
      <div className="pointer-events-none absolute inset-y-0 right-26 left-14 z-10">
        {grid.blocks.map((block) => {
          const entry = model.entries.get(block.id)
          if (entry?.kind !== "feed") return null
          return (
            <GridBlock
              key={block.id}
              block={block}
              text={blockText(entry.feed, display.volume, now)}
              name={entryName(entry, display, now)}
              onOpen={() => onOpen([block.id])}
            />
          )
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24">
        {markersOf(model, display, now).map((marker) => (
          <GridMarker
            key={marker.key}
            top={marker.top}
            Icon={MARKER_ICONS[marker.kind]}
            text={marker.text}
            name={marker.name}
            onOpen={() => onOpen(marker.ids)}
          />
        ))}
      </div>
      <HourRows rows={grid.hours} display={display} />
      {grid.now === null ? null : (
        <>
          <div
            aria-hidden="true"
            className={cn("pointer-events-none absolute inset-x-0 bottom-0 bg-muted/60", atStep(grid.now))}
          />
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute right-0 left-12 z-20 border-t-2 border-primary",
              atStep(grid.now),
            )}
          />
        </>
      )}
    </section>
  )
}

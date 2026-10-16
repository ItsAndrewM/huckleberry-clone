import { type HourRow, slotIn } from "@bt/domain"
import { type RouterEvents, useRouter } from "@tanstack/react-router"
import { cn } from "cn"
import { useState } from "react"
import { useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import type { Display } from "../today/display.ts"
import { anchorOf, type DayModel } from "./day-model.ts"
import { atStep, stepsTall } from "./grid-classes.ts"
import { GridItemView } from "./grid-item.tsx"
import { gridItems } from "./grid-order.ts"
import { HourRows } from "./hour-rows.tsx"

interface DayGridProps {
  readonly model: DayModel
  readonly display: Display
  readonly now: number
  readonly onOpen: (ids: ReadonlyArray<string>) => void
}

const scrollIntoMiddle = (node: HTMLDivElement) => node.scrollIntoView({ block: "center" })

const tappedAgain = ({ pathChanged, toLocation }: RouterEvents["onRendered"]) =>
  !pathChanged && toLocation.state.fromTab === true

export const DayGrid = ({ model, display, now, onOpen }: DayGridProps) => {
  const sheets = useSheets()
  const router = useRouter()
  const [placeAtAnchor] = useState(() => (node: HTMLDivElement | null) => {
    if (node === null) return undefined
    scrollIntoMiddle(node)
    return router.subscribe("onRendered", (event) => {
      if (tappedAgain(event)) scrollIntoMiddle(node)
    })
  })
  const { grid } = model
  const logAt = (row: HourRow, fraction: number) => {
    const slot = slotIn(row, fraction, tapTime())
    if (slot !== null) sheets.showAt("logAt", slot)
  }
  return (
    <section
      aria-label="The day by hour"
      className={cn("relative isolate mt-2 mb-4 [--cal-step:5px]", stepsTall(grid.steps))}
    >
      <div ref={placeAtAnchor} aria-hidden="true" className={cn("absolute", atStep(anchorOf(model)))} />
      {gridItems(model, display, now).map((item) => (
        <GridItemView key={item.key} item={item} model={model} display={display} now={now} onOpen={onOpen} />
      ))}
      <HourRows rows={grid.hours} display={display} now={now} onTap={logAt} />
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

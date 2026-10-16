import { cn } from "cn"
import { LayersIcon } from "lucide-react"
import type { Display } from "../today/display.ts"
import { KIND_ICONS } from "../today/kind-icons.ts"
import type { DayModel } from "./day-model.ts"
import { blockText, entryName, sleepBlockText } from "./entry-labels.ts"
import { GridBlock } from "./grid-block.tsx"
import { GridMarker } from "./grid-marker.tsx"
import type { GridItem } from "./grid-order.ts"
import { SleepBlock } from "./sleep-block.tsx"

const COLUMNS = {
  sleep: "left-14 w-11",
  feed: "right-26 left-26",
  marker: "right-0 w-24",
} as const satisfies Record<GridItem["kind"], string>

const MARKER_ICONS = {
  bottle: KIND_ICONS.bottle,
  diaper: KIND_ICONS.diaper,
  dose: KIND_ICONS.dose,
  several: LayersIcon,
} as const

interface GridItemViewProps {
  readonly item: GridItem
  readonly model: DayModel
  readonly display: Display
  readonly now: number
  readonly onOpen: (ids: ReadonlyArray<string>) => void
}

const ItemBody = ({ item, model, display, now, onOpen }: GridItemViewProps) => {
  if (item.kind === "marker") {
    const { marker } = item
    return (
      <GridMarker
        top={marker.top}
        Icon={MARKER_ICONS[marker.kind]}
        text={marker.text}
        name={marker.name}
        onOpen={() => onOpen(marker.ids)}
      />
    )
  }
  const entry = model.entries.get(item.key)
  if (item.kind === "sleep" && entry?.kind === "sleep") {
    return (
      <SleepBlock
        block={item.block}
        {...sleepBlockText(entry.sleep, now)}
        name={entryName(entry, display, now, model.date)}
        onOpen={() => onOpen([item.key])}
      />
    )
  }
  if (item.kind === "feed" && entry?.kind === "feed") {
    return (
      <GridBlock
        block={item.block}
        text={blockText(entry.feed, display.volume, now)}
        name={entryName(entry, display, now, model.date)}
        onOpen={() => onOpen([item.key])}
      />
    )
  }
  return null
}

export const GridItemView = (props: GridItemViewProps) => (
  <div className={cn("pointer-events-none absolute inset-y-0 z-10 focus-within:z-20", COLUMNS[props.item.kind])}>
    <ItemBody {...props} />
  </div>
)

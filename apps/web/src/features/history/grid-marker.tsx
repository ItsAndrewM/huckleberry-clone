import { cn } from "cn"
import type { LucideIcon } from "lucide-react"
import { SCALE } from "./day-model.ts"
import { atStep, stepsTall } from "./grid-classes.ts"

interface GridMarkerProps {
  readonly top: number
  readonly Icon: LucideIcon
  readonly text: string
  readonly name: string
  readonly onOpen: () => void
}

export const GridMarker = ({ top, Icon, text, name, onOpen }: GridMarkerProps) => (
  <button
    type="button"
    aria-label={name}
    onClick={onOpen}
    className={cn(
      "pointer-events-auto absolute inset-x-0 flex items-center gap-1 rounded-full bg-secondary px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      "text-[0.6875rem] font-medium text-secondary-foreground tabular-nums",
      atStep(top),
      stepsTall(SCALE.pointSteps),
    )}
  >
    <Icon aria-hidden="true" className="size-3.5 shrink-0" />
    <span className="truncate">{text}</span>
  </button>
)

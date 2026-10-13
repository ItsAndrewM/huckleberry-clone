import { RulerIcon } from "lucide-react"
import type { Hidden } from "./history-kinds.ts"

const Swatch = ({ className }: { readonly className: string }) => <span aria-hidden="true" className={className} />

export const WeekLegend = ({ hidden }: { readonly hidden: Hidden }) => (
  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-muted-foreground">
    {hidden.has("feeds") ? null : (
      <>
        <span className="inline-flex items-center gap-1">
          <Swatch className="h-3 w-1.5 rounded-[2px] border border-primary/50 bg-primary/45" />
          Nursing
        </span>
        <span className="inline-flex items-center gap-1">
          <Swatch className="size-1.5 rounded-full bg-primary" />
          Bottle
        </span>
      </>
    )}
    {hidden.has("diapers") ? null : (
      <span className="inline-flex items-center gap-1">
        <Swatch className="size-1.5 rounded-full bg-foreground/55" />
        Diaper
      </span>
    )}
    {hidden.has("growth") ? null : (
      <span className="inline-flex items-center gap-1">
        <RulerIcon aria-hidden="true" className="size-3" />
        Measured
      </span>
    )}
  </p>
)

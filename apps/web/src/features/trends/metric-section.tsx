import type { ReactNode } from "react"
import { Parts } from "../today/parts.tsx"
import type { TrendsMetric } from "./metrics.ts"
import type { Numbers } from "./trends-numbers.ts"

interface MetricSectionProps {
  readonly metric: TrendsMetric
  readonly numbers: Numbers
  readonly note?: string | null | undefined
  readonly children: ReactNode
}

export const MetricSection = ({ metric, numbers, note, children }: MetricSectionProps) => (
  <section aria-label={metric.title} className="flex flex-col gap-1">
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <h3 className="font-medium">{metric.title}</h3>
      <p className="text-base font-medium tabular-nums">{numbers.value}</p>
      {numbers.detail.length === 0 ? null : (
        <p className="w-full text-right text-xs tabular-nums text-muted-foreground">
          <Parts parts={numbers.detail} />
        </p>
      )}
      {note === null || note === undefined ? null : (
        <p className="w-full text-right text-xs tabular-nums text-muted-foreground">{note}</p>
      )}
    </div>
    {children}
  </section>
)

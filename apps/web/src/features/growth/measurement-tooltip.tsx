import type { GrowthRow } from "./chart-model.ts"

export const MeasurementTooltip = ({ row }: { readonly row: GrowthRow }) => (
  <div className="flex flex-col gap-0.5 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
    <p className="text-sm font-semibold whitespace-nowrap">
      {row.value}
      <span className="font-normal text-muted-foreground"> · {row.percentile}</span>
    </p>
    <p className="text-xs whitespace-nowrap text-muted-foreground">
      {row.measuredOn} · {row.age}
    </p>
  </div>
)

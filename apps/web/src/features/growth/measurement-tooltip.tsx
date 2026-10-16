import type { GrowthRow } from "./chart-model.ts"

export const MeasurementTooltip = ({ row }: { readonly row: GrowthRow }) => (
  <div className="flex flex-col gap-0.5 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
    <p aria-hidden="true" className="text-sm font-semibold whitespace-nowrap">
      {row.value}
      <span className="font-normal text-muted-foreground"> · {row.percentile}</span>
    </p>
    <p aria-hidden="true" className="text-xs whitespace-nowrap text-muted-foreground">
      {row.measuredOn} · {row.age}
    </p>
    <p className="sr-only">
      {row.value}, {row.percentile}, {row.measuredOn}, {row.ageWords}
    </p>
  </div>
)

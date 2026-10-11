import { BabyIcon, RulerIcon, WeightIcon } from "lucide-react"
import type { CardCell, MeasurementCard } from "./cards.ts"

const ICONS = {
  weightForAge: WeightIcon,
  lengthForAge: RulerIcon,
  headCircumferenceForAge: BabyIcon,
} as const

const Cell = ({ cell: { info, value, percentile } }: { readonly cell: CardCell }) => {
  const Icon = ICONS[info.metric]
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {info.label}
      </dt>
      <dd className="text-base font-medium tabular-nums">
        {value ?? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not measured</span>
          </>
        )}
      </dd>
      {percentile === null ? null : <dd className="text-xs text-muted-foreground tabular-nums">{percentile}</dd>}
    </div>
  )
}

export const MeasurementCardView = ({ card }: { readonly card: MeasurementCard }) => (
  <li className="flex flex-col gap-3 rounded-xl border bg-card p-4">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h3 className="text-sm font-medium">
        {card.measuredOn} · {card.age}
      </h3>
      {card.saving ? <span className="text-sm text-muted-foreground">Saving…</span> : null}
    </div>
    <dl className="grid grid-cols-3 gap-2">
      {card.cells.map((cell) => (
        <Cell key={cell.info.metric} cell={cell} />
      ))}
    </dl>
  </li>
)

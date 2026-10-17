import { BabyIcon, ChevronRightIcon, RulerIcon, WeightIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
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

interface MeasurementCardViewProps {
  readonly card: MeasurementCard
  readonly onEdit: (id: string) => void
}

export const MeasurementCardView = ({ card, onEdit }: MeasurementCardViewProps) => (
  <li className="relative flex flex-col gap-3 rounded-xl border bg-card p-4">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h3 aria-label={`${card.measuredOn}, ${card.ageWords}`} className="text-sm font-medium">
        {card.measuredOn} · {card.age}
      </h3>
      {card.saving ? (
        <span className="text-sm text-muted-foreground">Saving…</span>
      ) : (
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={`Edit the measurement from ${card.measuredOn}`}
          className="-mr-2 after:absolute after:inset-0 active:not-aria-[haspopup]:translate-none"
          onClick={() => onEdit(card.id)}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      )}
    </div>
    <dl className="grid grid-cols-3 gap-2">
      {card.cells.map((cell) => (
        <Cell key={cell.info.metric} cell={cell} />
      ))}
    </dl>
  </li>
)

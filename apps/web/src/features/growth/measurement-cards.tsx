import { useId } from "react"
import type { MeasurementCard } from "./cards.ts"
import { MeasurementCardView } from "./measurement-card.tsx"

export const MeasurementCards = ({ cards }: { readonly cards: ReadonlyArray<MeasurementCard> }) => {
  const title = useId()
  return (
    <section aria-labelledby={title} className="flex flex-col gap-3">
      <h2 id={title} className="font-medium">
        Measurements
      </h2>
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <MeasurementCardView key={card.id} card={card} />
        ))}
      </ul>
    </section>
  )
}

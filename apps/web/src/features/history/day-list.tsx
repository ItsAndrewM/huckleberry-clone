import { CalendarPlusIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import { Card } from "../../components/ui/card.tsx"
import { RecentItem } from "../today/recent-list.tsx"
import type { RecentRow } from "../today/recent-rows.ts"

interface DayListProps {
  readonly rows: ReadonlyArray<RecentRow>
  readonly note: string | null
  readonly onOpen: (id: string) => void
  readonly onLog: () => void
}

export const DayList = ({ rows, note, onOpen, onLog }: DayListProps) => (
  <section aria-label="The day's entries" className="mt-2 mb-4 flex flex-col gap-3">
    {note === null ? null : <p className="text-sm text-muted-foreground">{note}</p>}
    {rows.length === 0 ? null : (
      <Card className="py-0">
        <ol className="divide-y">
          {rows.map((row) => (
            <RecentItem key={row.id} row={row} onOpen={({ id }) => onOpen(id)} />
          ))}
        </ol>
      </Card>
    )}
    <Button variant="outline" size="lg" className="gap-2" onClick={onLog}>
      <CalendarPlusIcon aria-hidden="true" />
      Log on this day…
    </Button>
  </section>
)

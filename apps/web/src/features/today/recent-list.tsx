import { Card } from "../../components/ui/card.tsx"
import { KIND_ICONS } from "./kind-icons.ts"
import { Parts } from "./parts.tsx"
import type { RecentRow } from "./recent-rows.ts"

const RowContent = ({ row }: { readonly row: RecentRow }) => {
  const Icon = KIND_ICONS[row.kind]
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{row.title}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          <Parts parts={row.detail} />
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <time dateTime={new Date(row.at).toISOString()} className="text-sm tabular-nums">
          {row.time}
        </time>
        <span className="text-xs text-muted-foreground">{row.saving ? "Saving…" : row.by}</span>
      </span>
    </>
  )
}

const ROW = "flex w-full items-center gap-3 px-4 py-3 text-left"

interface RecentItemProps {
  readonly row: RecentRow
  readonly onOpen: (row: RecentRow) => void
}

const RecentItem = ({ row, onOpen }: RecentItemProps) => (
  <li>
    {row.opens === null ? (
      <div className={ROW}>
        <RowContent row={row} />
      </div>
    ) : (
      <button type="button" className={`${ROW} hover:bg-muted/50 active:bg-muted`} onClick={() => onOpen(row)}>
        <RowContent row={row} />
      </button>
    )}
  </li>
)

interface RecentListProps {
  readonly rows: ReadonlyArray<RecentRow>
  readonly onOpen: (row: RecentRow) => void
}

export const RecentList = ({ rows, onOpen }: RecentListProps) => (
  <section aria-labelledby="recent-title" className="flex flex-col gap-3">
    <h2 id="recent-title" className="text-sm font-medium text-muted-foreground">
      Last 24 hours
    </h2>
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nothing logged in the last 24 hours.</p>
    ) : (
      <Card className="py-0">
        <ol aria-labelledby="recent-title" className="divide-y">
          {rows.map((row) => (
            <RecentItem key={row.id} row={row} onOpen={onOpen} />
          ))}
        </ol>
      </Card>
    )}
  </section>
)

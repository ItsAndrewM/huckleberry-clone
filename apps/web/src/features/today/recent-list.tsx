import { isPending } from "../../api/pending.ts"
import { Card } from "../../components/ui/card.tsx"
import { KIND_ICONS } from "./kind-icons.ts"
import { Parts } from "./parts.tsx"
import type { RecentRow } from "./recent-rows.ts"

const RecentItem = ({ row }: { readonly row: RecentRow }) => {
  const Icon = KIND_ICONS[row.kind]
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-medium">{row.title}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          <Parts parts={row.detail} />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <time dateTime={new Date(row.at).toISOString()} className="text-sm tabular-nums">
          {row.time}
        </time>
        <p className="text-xs text-muted-foreground">{isPending(row.id) ? "Saving…" : row.by}</p>
      </div>
    </li>
  )
}

export const RecentList = ({ rows }: { readonly rows: ReadonlyArray<RecentRow> }) => (
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
            <RecentItem key={row.id} row={row} />
          ))}
        </ol>
      </Card>
    )}
  </section>
)

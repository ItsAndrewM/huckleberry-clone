import { Button } from "../../components/ui/button.tsx"
import type { Household } from "../../sheets/failure.ts"
import { Parts } from "../today/parts.tsx"
import { DELETED_ICONS } from "./deleted-icons.ts"
import type { DeletedRow } from "./deleted-rows.ts"
import { restoreFailure } from "./restore.ts"
import { useRestore } from "./use-restore.ts"

interface DeletedItemProps {
  readonly row: DeletedRow
  readonly household: Household
  readonly reasonId: string | undefined
}

export const DeletedItem = ({ row, household, reasonId }: DeletedItemProps) => {
  const restoring = useRestore(row)
  const Icon = DELETED_ICONS[row.icon]
  const label = restoring.busy ? "Restoring…" : "Restore"
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-medium">{row.title}</p>
          {row.detail.length === 0 ? null : (
            <p className="text-sm tabular-nums text-muted-foreground">
              <Parts parts={row.detail} />
            </p>
          )}
          <time dateTime={new Date(row.at).toISOString()} className="text-sm tabular-nums">
            {row.when}
          </time>
          <p className="text-xs text-muted-foreground">
            <Parts parts={row.deleted} />
          </p>
        </div>
        <Button
          variant="secondary"
          size="lg"
          disabled={reasonId !== undefined || restoring.busy}
          aria-label={`${label} ${row.title}, ${row.when}`}
          aria-describedby={reasonId}
          onClick={restoring.restore}
        >
          {label}
        </Button>
      </div>
      {restoring.error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {restoreFailure(restoring.error, household)}
        </p>
      )}
    </li>
  )
}

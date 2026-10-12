import { RECENTLY_DELETED_DAYS } from "@bt/contracts"
import { useId } from "react"
import { Card } from "../../components/ui/card.tsx"
import type { Household } from "../../sheets/failure.ts"
import { DeletedItem } from "./deleted-item.tsx"
import type { DeletedRow } from "./deleted-rows.ts"

interface DeletedListProps {
  readonly rows: ReadonlyArray<DeletedRow>
  readonly household: Household
  readonly reason: string | null
}

export const DeletedList = ({ rows, household, reason }: DeletedListProps) => {
  const reasonId = useId()
  if (rows.length === 0) {
    return <p className="text-muted-foreground">Nothing was deleted in the last {RECENTLY_DELETED_DAYS} days.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {reason === null ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {reason}
        </p>
      )}
      <Card className="py-0">
        <ol aria-label="Deleted entries" className="divide-y">
          {rows.map((row) => (
            <DeletedItem
              key={`${row.id}:${row.version}`}
              row={row}
              household={household}
              reasonId={reason === null ? undefined : reasonId}
            />
          ))}
        </ol>
      </Card>
    </div>
  )
}

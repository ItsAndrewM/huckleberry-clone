import { ChevronRightIcon } from "lucide-react"
import { Card, CardHeader, CardTitle } from "../../components/ui/card.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { KIND_ICONS } from "./kind-icons.ts"
import { Parts } from "./parts.tsx"
import type { SupplementRow } from "./supplement-rows.ts"

const Icon = KIND_ICONS.dose

const SupplementItem = ({ row }: { readonly row: SupplementRow }) => {
  const sheets = useSheets()
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 active:bg-muted"
        onClick={() => sheets.show("dose", row.id)}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{row.title}</span>
          {row.detail.length === 0 ? null : (
            <span className="text-sm text-muted-foreground">
              <Parts parts={row.detail} />
            </span>
          )}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

export const SupplementsCard = ({ rows }: { readonly rows: ReadonlyArray<SupplementRow> }) =>
  rows.length === 0 ? null : (
    <Card className="gap-0 py-0">
      <CardHeader className="py-3">
        <CardTitle id="supplements-title" className="text-sm text-muted-foreground">
          Supplements
        </CardTitle>
      </CardHeader>
      <ul aria-labelledby="supplements-title" className="divide-y border-t">
        {rows.map((row) => (
          <SupplementItem key={row.id} row={row} />
        ))}
      </ul>
    </Card>
  )

import { Button } from "../../components/ui/button.tsx"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import type { Display } from "../today/display.ts"
import type { Entry } from "./day-model.ts"
import { entryDetails } from "./entry-details.ts"

interface DetailsSheetProps {
  readonly entries: ReadonlyArray<Entry>
  readonly display: Display
  readonly now: number
}

export const DetailsSheet = ({ entries, display, now }: DetailsSheetProps) => {
  const sheets = useSheets()
  const details = entries.map((entry) => entryDetails(entry, display, now))
  const [only] = details
  const title = details.length === 1 && only !== undefined ? only.title : `${details.length} entries`
  return (
    <Sheet sheet="details" title={details.length === 0 ? "Deleted" : title}>
      {details.length === 0 ? <p className="text-sm text-muted-foreground">This entry was deleted.</p> : null}
      <ul className="flex flex-col divide-y">
        {details.map(({ id, title: name, when, lines, by }) => (
          <li key={id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            {details.length === 1 ? null : <p className="font-medium">{name}</p>}
            <p className="text-sm text-muted-foreground tabular-nums">{when}</p>
            {lines.map((line) => (
              <p key={line} className="tabular-nums">
                {line}
              </p>
            ))}
            {by === "" ? null : <p className="text-sm text-muted-foreground">{by}</p>}
          </li>
        ))}
      </ul>
      <Button variant="outline" size="lg" onClick={sheets.close}>
        Close
      </Button>
    </Sheet>
  )
}

import type { LocalDate } from "@bt/contracts"
import { cn } from "cn"
import { Button } from "../../components/ui/button.tsx"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import type { Display } from "../today/display.ts"
import { type Entry, editSheetOf } from "./day-model.ts"
import { type EntryDetails, entryDetails } from "./entry-details.ts"
import { entryName } from "./entry-labels.ts"

interface DetailsSheetProps {
  readonly entries: ReadonlyArray<Entry>
  readonly display: Display
  readonly now: number
  readonly day: LocalDate
}

interface DetailsItemProps {
  readonly details: EntryDetails
  readonly name: string
  readonly named: boolean
  readonly onEdit: (() => void) | null
}

const DetailsItem = ({ details: { title, when, lines, by }, name, named, onEdit }: DetailsItemProps) => (
  <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
    {named ? <p className="font-medium break-words">{title}</p> : null}
    <p className="text-sm text-muted-foreground tabular-nums">{when}</p>
    {lines.map((line) => (
      <p key={line} className="tabular-nums break-words">
        {line}
      </p>
    ))}
    {by === "" ? null : <p className="text-sm text-muted-foreground">{by}</p>}
    {onEdit === null ? null : (
      <Button variant="outline" size="lg" className="mt-2 self-start" aria-label={`Edit ${name}`} onClick={onEdit}>
        Edit
      </Button>
    )}
  </li>
)

export const DetailsSheet = ({ entries, display, now, day }: DetailsSheetProps) => {
  const sheets = useSheets()
  const details = entries.map((entry) => ({
    entry,
    details: entryDetails(entry, display, now),
    name: entryName(entry, display, now, day),
  }))
  const [only] = details
  const single = details.length === 1 && only !== undefined
  const title = single ? only.details.title : `${details.length} entries`
  const edit = (entry: Entry, id: string) => () => {
    const sheet = editSheetOf(entry)
    if (sheet === "nursing" || sheet === "sleep") {
      sheets.show(sheet)
      return
    }
    sheets.show(sheet, id)
  }
  return (
    <Sheet sheet="details" title={details.length === 0 ? "Deleted" : title}>
      {details.length === 0 ? <p className="text-sm text-muted-foreground">This entry was deleted.</p> : null}
      <ul className="flex flex-col divide-y">
        {details.map(({ entry, details: shown, name }) => (
          <DetailsItem
            key={shown.id}
            details={shown}
            name={name}
            named={!single}
            onEdit={single ? null : edit(entry, shown.id)}
          />
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        {single ? (
          <Button size="lg" onClick={edit(only.entry, only.details.id)}>
            Edit
          </Button>
        ) : null}
        <Button variant="outline" size="lg" className={cn(!single && "col-span-2")} onClick={sheets.close}>
          Close
        </Button>
      </div>
    </Sheet>
  )
}

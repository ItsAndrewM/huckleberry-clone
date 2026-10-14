import type { Supplement } from "@bt/contracts"
import { ChevronRightIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { SettingsSection } from "./settings-section.tsx"
import { type SupplementItem, supplementList } from "./supplement-fields.ts"

interface SupplementItemsProps {
  readonly labelledBy: string
  readonly items: ReadonlyArray<SupplementItem>
}

const SupplementItems = ({ labelledBy, items }: SupplementItemsProps) => {
  const sheets = useSheets()
  return (
    <ul aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {items.map(({ id, label }) => (
        <li key={id}>
          <Button
            variant="outline"
            size="lg"
            className="h-auto min-h-11 w-full justify-between py-2 text-left whitespace-normal"
            onClick={() => sheets.show("supplement", id)}
          >
            <span className="min-w-0 break-words">{label}</span>
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  )
}

export const SupplementsSection = ({ supplements }: { readonly supplements: ReadonlyArray<Supplement> }) => {
  const sheets = useSheets()
  const { inUse, stopped } = supplementList(supplements)
  return (
    <SettingsSection titleId="supplements-label" title="Supplements" hint="Today shows each one in use.">
      {inUse.length === 0 ? null : <SupplementItems labelledBy="supplements-label" items={inUse} />}
      <Button variant="secondary" size="lg" onClick={() => sheets.show("supplement")}>
        Add a supplement
      </Button>
      {stopped.length === 0 ? null : (
        <>
          <h3 id="stopped-supplements-label" className="text-sm font-medium text-muted-foreground">
            Stopped
          </h3>
          <SupplementItems labelledBy="stopped-supplements-label" items={stopped} />
        </>
      )}
    </SettingsSection>
  )
}

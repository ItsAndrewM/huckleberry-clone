import { type LucideIcon, RulerIcon } from "lucide-react"
import { clockTime } from "../../clock-time.ts"
import { Button } from "../../components/ui/button.tsx"
import type { SheetKind } from "../../sheets/sending.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { KIND_ICONS } from "../today/kind-icons.ts"

const CHOICES = [
  { label: "Bottle", sheet: "bottle", Icon: KIND_ICONS.bottle },
  { label: "Nursing", sheet: "pastFeed", Icon: KIND_ICONS.nursing },
  { label: "Diaper", sheet: "diaper", Icon: KIND_ICONS.diaper },
  { label: "Measurement", sheet: "measurement", Icon: RulerIcon },
] as const satisfies ReadonlyArray<{ label: string; sheet: SheetKind; Icon: LucideIcon }>

export const LogAtSheet = ({ zone }: { readonly zone: string }) => {
  const sheets = useSheets()
  const { at } = sheets
  return (
    <Sheet sheet="logAt" title={at === null ? "Log" : `Log at ${clockTime(at, zone)}`}>
      <div className="grid grid-cols-2 gap-2">
        {CHOICES.map(({ label, sheet, Icon }) => (
          <Button
            key={label}
            variant="secondary"
            size="lg"
            className="h-14 gap-2"
            disabled={at === null}
            onClick={() => {
              if (at !== null) sheets.showAt(sheet, at)
            }}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
      </div>
    </Sheet>
  )
}

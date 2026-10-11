import type { LucideIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import type { SheetKind } from "../../sheets/sending.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { KIND_ICONS } from "./kind-icons.ts"

const ACTIONS = [
  { label: "Bottle", sheet: "bottle", Icon: KIND_ICONS.bottle },
  { label: "Nursing", sheet: "nursing", Icon: KIND_ICONS.nursing },
  { label: "Diaper", sheet: "diaper", Icon: KIND_ICONS.diaper },
] as const satisfies ReadonlyArray<{ label: string; sheet: SheetKind; Icon: LucideIcon }>

export const QuickActions = ({ ready }: { readonly ready: boolean }) => {
  const sheets = useSheets()
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background/95 backdrop-blur-sm">
      <section aria-label="Log" className="mx-auto flex max-w-lg gap-2 px-4 py-2">
        {ACTIONS.map(({ label, sheet, Icon }) => (
          <Button
            key={label}
            variant="secondary"
            size="lg"
            className="h-12 flex-1 gap-1.5 px-2"
            disabled={!ready}
            onClick={() => sheets.show(sheet)}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
      </section>
    </div>
  )
}

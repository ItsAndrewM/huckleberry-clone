import type { LucideIcon } from "lucide-react"
import { useId } from "react"
import { Button } from "../../components/ui/button.tsx"
import type { SheetKind } from "../../sheets/sending.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { useTodayLoaded, WAITS_FOR_TODAY } from "../../sheets/use-today-loaded.ts"
import { KIND_ICONS } from "./kind-icons.ts"

const ACTIONS = [
  { label: "Bottle", sheet: "bottle", Icon: KIND_ICONS.bottle },
  { label: "Nursing", sheet: "nursing", Icon: KIND_ICONS.nursing },
  { label: "Diaper", sheet: "diaper", Icon: KIND_ICONS.diaper },
  { label: "Sleep", sheet: "sleep", Icon: KIND_ICONS.sleep },
] as const satisfies ReadonlyArray<{ label: string; sheet: SheetKind; Icon: LucideIcon }>

export const QuickActions = () => {
  const sheets = useSheets()
  const ready = useTodayLoaded()
  const waitsId = useId()
  return (
    <div
      data-quick-actions
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background/95 backdrop-blur-sm"
    >
      <section aria-label="Log" className="mx-auto flex max-w-lg flex-col gap-1.5 px-4 py-2">
        {ready ? null : (
          <p id={waitsId} className="text-center text-sm text-muted-foreground">
            {WAITS_FOR_TODAY}
          </p>
        )}
        <div className="flex gap-2">
          {ACTIONS.map(({ label, sheet, Icon }) => (
            <Button
              key={label}
              variant="secondary"
              size="lg"
              className="h-12 min-w-0 flex-1 flex-col gap-0.5 px-1 text-xs"
              disabled={!ready}
              aria-describedby={ready ? undefined : waitsId}
              onClick={() => sheets.show(sheet)}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}

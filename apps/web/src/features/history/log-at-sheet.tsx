import { type LucideIcon, RulerIcon } from "lucide-react"
import { useId } from "react"
import { clockTime } from "../../clock-time.ts"
import { Button } from "../../components/ui/button.tsx"
import { Sheet } from "../../sheets/sheet.tsx"
import { type TimedSheet, useSheets } from "../../sheets/sheets-context.ts"
import { useTodayLoaded, WAITS_FOR_TODAY } from "../../sheets/use-today-loaded.ts"
import { KIND_ICONS } from "../today/kind-icons.ts"

const CHOICES = [
  { label: "Bottle", sheet: "bottle", Icon: KIND_ICONS.bottle, needsToday: true },
  { label: "Nursing", sheet: "pastFeed", Icon: KIND_ICONS.nursing, needsToday: false },
  { label: "Diaper", sheet: "diaper", Icon: KIND_ICONS.diaper, needsToday: false },
  { label: "Measurement", sheet: "measurement", Icon: RulerIcon, needsToday: false },
] as const satisfies ReadonlyArray<{ label: string; sheet: TimedSheet; Icon: LucideIcon; needsToday: boolean }>

const LogAtChoices = ({ at }: { readonly at: number | null }) => {
  const sheets = useSheets()
  const todayLoaded = useTodayLoaded()
  const waitsId = useId()
  return (
    <div className="flex flex-col gap-2">
      {todayLoaded ? null : (
        <p id={waitsId} className="text-sm text-muted-foreground">
          {WAITS_FOR_TODAY}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {CHOICES.map(({ label, sheet, Icon, needsToday }) => {
          const waits = needsToday && !todayLoaded
          return (
            <Button
              key={label}
              variant="secondary"
              size="lg"
              className="h-14 gap-2"
              disabled={at === null || waits}
              aria-describedby={waits ? waitsId : undefined}
              onClick={() => {
                if (at !== null) sheets.showAt(sheet, at)
              }}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export const LogAtSheet = ({ zone }: { readonly zone: string }) => {
  const { at } = useSheets()
  return (
    <Sheet sheet="logAt" title={at === null ? "Log" : `Log at ${clockTime(at, zone)}`}>
      <LogAtChoices at={at} />
    </Sheet>
  )
}

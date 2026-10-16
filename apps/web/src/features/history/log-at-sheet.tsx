import { localDateOf } from "@bt/domain"
import { type LucideIcon, RulerIcon } from "lucide-react"
import { useId } from "react"
import { useMe } from "../../api/hooks.ts"
import { clockTime } from "../../clock-time.ts"
import { Button } from "../../components/ui/button.tsx"
import { Sheet } from "../../sheets/sheet.tsx"
import { type TimedSheet, useSheets } from "../../sheets/sheets-context.ts"
import { useLastOpen } from "../../sheets/use-last-open.ts"
import { useTodayLoaded } from "../../sheets/use-today-loaded.ts"
import { useMinute } from "../../timer/use-now.ts"
import { KIND_ICONS } from "../today/kind-icons.ts"
import { dayTitle } from "./history-date.ts"
import { supplementChoices } from "./log-at-supplements.ts"

const BOTTLE_WAITS = "Bottle opens once Today loads."

const CHOICES = [
  { label: "Bottle", sheet: "bottle", Icon: KIND_ICONS.bottle, needsToday: true },
  { label: "Nursing", sheet: "pastFeed", Icon: KIND_ICONS.nursing, needsToday: false },
  { label: "Diaper", sheet: "diaper", Icon: KIND_ICONS.diaper, needsToday: false },
  { label: "Sleep", sheet: "pastSleep", Icon: KIND_ICONS.sleep, needsToday: false },
  { label: "Measurement", sheet: "measurement", Icon: RulerIcon, needsToday: false },
] as const satisfies ReadonlyArray<{ label: string; sheet: TimedSheet; Icon: LucideIcon; needsToday: boolean }>

const DoseIcon = KIND_ICONS.dose

interface SupplementButtonsProps {
  readonly at: number | null
  readonly disabled: boolean
  readonly onChoose: (id: string) => void
}

const SupplementButtons = ({ at, disabled, onChoose }: SupplementButtonsProps) => {
  const { data: me } = useMe()
  return supplementChoices(me?.household.supplements ?? [], at).map(({ id, label }) => (
    <Button
      key={id}
      variant="secondary"
      size="lg"
      className="h-14 min-w-0 gap-2"
      disabled={disabled}
      onClick={() => onChoose(id)}
    >
      <DoseIcon aria-hidden="true" />
      <span className="line-clamp-2 break-words whitespace-normal">{label}</span>
    </Button>
  ))
}

const LogAtChoices = ({ at }: { readonly at: number | null }) => {
  const sheets = useSheets()
  const todayLoaded = useTodayLoaded()
  const waitsId = useId()
  const closing = sheets.open !== "logAt"
  const choose = (sheet: TimedSheet, editing?: string) => {
    if (at === null) sheets.show(sheet, editing)
    else sheets.showAt(sheet, at, editing)
  }
  return (
    <div className="flex flex-col gap-2">
      {todayLoaded ? null : (
        <p id={waitsId} className="text-sm text-muted-foreground">
          {BOTTLE_WAITS}
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
              disabled={closing || waits}
              aria-describedby={waits ? waitsId : undefined}
              onClick={() => choose(sheet)}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          )
        })}
        <SupplementButtons at={at} disabled={closing} onChoose={(id) => choose("dose", id)} />
      </div>
    </div>
  )
}

const LogAtTitle = ({ at, zone }: { readonly at: number; readonly zone: string }) => {
  const now = useMinute()
  const day = localDateOf(at, zone)
  const isToday = day === localDateOf(now, zone)
  return (
    <>
      Log at {clockTime(at, zone)}
      {isToday ? null : <span className="sr-only"> on {dayTitle(day)}</span>}
    </>
  )
}

export const LogAtSheet = ({ zone }: { readonly zone: string }) => {
  const sheets = useSheets()
  const at = useLastOpen(sheets.open === "logAt", sheets.at)
  return (
    <Sheet sheet="logAt" title={at === null ? "Log" : <LogAtTitle at={at} zone={zone} />}>
      <LogAtChoices at={at} />
    </Sheet>
  )
}

import type { TimeZone } from "@bt/domain"
import { useId, useState } from "react"
import type { ExportKind } from "../../api/export.ts"
import { Button } from "../../components/ui/button.tsx"
import { focusOpenerOnLeave } from "../../shell/focus-hand-off.ts"
import { sharesKind } from "./deliver-file.ts"
import type { Exported } from "./export-state.ts"
import { SettingsSection } from "./settings-section.tsx"
import { useExport } from "./use-export.ts"

const KINDS = ["csv", "json"] as const satisfies ReadonlyArray<ExportKind>

const NAMES = { csv: "CSV", json: "JSON" } satisfies Record<ExportKind, string>

const labelFor = (kind: ExportKind) => `${sharesKind(kind) ? "Share" : "Download"} ${NAMES[kind]}`

const LABELS = { csv: labelFor("csv"), json: labelFor("json") } satisfies Record<ExportKind, string>

const readyFor = (kind: ExportKind) => `The ${NAMES[kind]} is ready.`

const announcement = (preparing: ExportKind | null, waiting: Exported | null) => {
  if (preparing !== null) return `Preparing the ${NAMES[preparing]}…`
  return waiting === null ? "" : readyFor(waiting.kind)
}

interface ShareAgainProps {
  readonly waiting: Exported
  readonly sharing: boolean
  readonly openerId: string
  readonly onShare: (waiting: Exported) => void
}

const ShareAgain = ({ waiting, sharing, openerId, onShare }: ShareAgainProps) => {
  const [handsBack] = useState(() => focusOpenerOnLeave(openerId))
  return (
    <div className="flex items-center justify-between gap-3">
      <p aria-hidden="true" className="text-base">
        {readyFor(waiting.kind)}
      </p>
      <Button ref={handsBack} size="lg" disabled={sharing} focusableWhenDisabled onClick={() => onShare(waiting)}>
        Share it
      </Button>
    </div>
  )
}

export const ExportSection = ({ timeZone }: { readonly timeZone: TimeZone }) => {
  const reasonId = useId()
  const buttonsId = useId()
  const exporting = useExport(timeZone)
  const waits = exporting.reason !== null
  return (
    <SettingsSection
      titleId="export-label"
      title="Export"
      hint="CSV opens in Numbers or Sheets. JSON is a full backup, deleted entries included."
    >
      {waits ? (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {exporting.reason}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <Button
            key={kind}
            id={`${buttonsId}${kind}`}
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={waits || exporting.busy}
            focusableWhenDisabled
            aria-describedby={waits ? reasonId : undefined}
            onClick={() => exporting.start(kind)}
          >
            {exporting.preparing === kind ? "Preparing…" : LABELS[kind]}
          </Button>
        ))}
      </div>
      <output className="sr-only">{announcement(exporting.preparing, exporting.waiting)}</output>
      {exporting.waiting === null ? null : (
        <ShareAgain
          key={exporting.waiting.kind}
          waiting={exporting.waiting}
          sharing={exporting.sharing}
          openerId={`${buttonsId}${exporting.waiting.kind}`}
          onShare={exporting.shareAgain}
        />
      )}
      {exporting.failure === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {exporting.failure}
        </p>
      )}
    </SettingsSection>
  )
}

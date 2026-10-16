import type { TimeZone } from "@bt/domain"
import { useId } from "react"
import type { ExportKind } from "../../api/export.ts"
import { Button } from "../../components/ui/button.tsx"
import { sharesKind } from "./deliver-file.ts"
import { SettingsSection } from "./settings-section.tsx"
import { type Exported, useExport } from "./use-export.ts"

const KINDS = ["csv", "json"] as const satisfies ReadonlyArray<ExportKind>

const NAMES = { csv: "CSV", json: "JSON" } satisfies Record<ExportKind, string>

const labelFor = (kind: ExportKind) => `${sharesKind(kind) ? "Share" : "Download"} ${NAMES[kind]}`

const LABELS = { csv: labelFor("csv"), json: labelFor("json") } satisfies Record<ExportKind, string>

const readyFor = (kind: ExportKind) => `The ${NAMES[kind]} is ready.`

const announcement = (preparing: ExportKind | null, waiting: Exported | null) => {
  if (preparing !== null) return `Preparing the ${NAMES[preparing]}…`
  return waiting === null ? "" : readyFor(waiting.kind)
}

const ShareAgain = ({
  waiting,
  onShare,
}: {
  readonly waiting: Exported
  readonly onShare: (waiting: Exported) => void
}) => (
  <div className="flex items-center justify-between gap-3">
    <p aria-hidden="true" className="text-base">
      {readyFor(waiting.kind)}
    </p>
    <Button size="lg" onClick={() => onShare(waiting)}>
      Share it
    </Button>
  </div>
)

export const ExportSection = ({ timeZone }: { readonly timeZone: TimeZone }) => {
  const reasonId = useId()
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
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={waits || exporting.busy}
            aria-describedby={waits ? reasonId : undefined}
            onClick={() => exporting.start(kind)}
          >
            {exporting.preparing === kind ? "Preparing…" : LABELS[kind]}
          </Button>
        ))}
      </div>
      <output className="sr-only">{announcement(exporting.preparing, exporting.waiting)}</output>
      {exporting.waiting === null ? null : <ShareAgain waiting={exporting.waiting} onShare={exporting.shareAgain} />}
      {exporting.failure === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {exporting.failure}
        </p>
      )}
    </SettingsSection>
  )
}

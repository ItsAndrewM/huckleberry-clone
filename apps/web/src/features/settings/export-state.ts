import type { ExportKind } from "../../api/export.ts"
import { type Delivery, exportFailure } from "./export-file.ts"

export interface ExportRequest {
  readonly kind: ExportKind
  readonly file: File | null
}

export interface Exported {
  readonly kind: ExportKind
  readonly file: File
  readonly delivery: Delivery
}

interface ExportMutation {
  readonly isPending: boolean
  readonly data: Exported | undefined
  readonly error: Error | null
  readonly variables: ExportRequest | undefined
}

const sharedAgain = (variables: ExportRequest | undefined): Exported | null =>
  variables === undefined || variables.file === null
    ? null
    : { kind: variables.kind, file: variables.file, delivery: "needs-a-tap" }

const awaitingTap = (data: Exported | undefined) => (data?.delivery === "needs-a-tap" ? data : null)

export const exportState = ({ isPending, data, error, variables }: ExportMutation) => {
  const again = isPending ? sharedAgain(variables) : null
  return {
    busy: isPending,
    preparing: isPending && again === null ? (variables?.kind ?? null) : null,
    waiting: isPending ? again : awaitingTap(data),
    sharing: again !== null,
    failure: isPending ? null : exportFailure(error),
  }
}

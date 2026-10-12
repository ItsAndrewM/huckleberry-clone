import { localDateOf, type TimeZone } from "@bt/domain"
import { useMutation } from "@tanstack/react-query"
import { type ExportKind, fetchExport } from "../../api/export.ts"
import { useConnectivity } from "../../api/hooks.ts"
import { useApp } from "../../app-context.ts"
import { deliverFile } from "./deliver-file.ts"
import { type Delivery, exportFailure, exportFileOf, waitReason } from "./export-file.ts"

interface ExportRequest {
  readonly kind: ExportKind
  readonly file: File | null
}

export interface Exported {
  readonly kind: ExportKind
  readonly file: File
  readonly delivery: Delivery
}

export const useExport = (timeZone: TimeZone) => {
  const { api } = useApp()
  const reason = waitReason(useConnectivity())
  const exporting = useMutation({
    mutationFn: async ({ kind, file }: ExportRequest): Promise<Exported> => {
      if (file !== null) return { kind, file, delivery: await deliverFile(file, "again") }
      const fetched = exportFileOf(kind, await fetchExport(api, kind), localDateOf(Date.now(), timeZone))
      return { kind, file: fetched, delivery: await deliverFile(fetched, "first") }
    },
  })
  const { isPending, data, error, variables } = exporting
  return {
    reason,
    busy: isPending,
    preparing: isPending ? (variables?.kind ?? null) : null,
    waiting: !isPending && data?.delivery === "needs-a-tap" ? data : null,
    failure: isPending ? null : exportFailure(error),
    start: (kind: ExportKind) => exporting.mutate({ kind, file: null }),
    shareAgain: ({ kind, file }: Exported) => exporting.mutate({ kind, file }),
  }
}

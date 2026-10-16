import { localDateOf, type TimeZone } from "@bt/domain"
import { useMutation } from "@tanstack/react-query"
import { type ExportKind, fetchExport } from "../../api/export.ts"
import { useConnectivity } from "../../api/hooks.ts"
import { useApp } from "../../app-context.ts"
import { deliverFile } from "./deliver-file.ts"
import { exportFileOf, waitReason } from "./export-file.ts"
import { type Exported, type ExportRequest, exportState } from "./export-state.ts"

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
  return {
    reason,
    ...exportState(exporting),
    start: (kind: ExportKind) => exporting.mutate({ kind, file: null }),
    shareAgain: ({ kind, file }: Exported) => exporting.mutate({ kind, file }),
  }
}

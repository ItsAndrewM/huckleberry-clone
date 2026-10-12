import type { HouseholdApi } from "./client.ts"

export type ExportKind = "csv" | "json"

export const fetchExport = (api: HouseholdApi, kind: ExportKind): Promise<string> =>
  kind === "csv"
    ? api.request((client) => client.export.exportCsv())
    : api.request((client) => client.export.exportJson()).then((exported) => JSON.stringify(exported))

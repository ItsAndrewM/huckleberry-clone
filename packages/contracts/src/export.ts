import { Option, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Instant } from "./time.ts"

export const ExportCell = Schema.NullOr(Schema.Union([Schema.String, Schema.Finite]))
export type ExportCell = typeof ExportCell.Type

export const ExportRow = Schema.Record(Schema.String, ExportCell)
export type ExportRow = typeof ExportRow.Type

export const HouseholdExport = Schema.Struct({
  format: Schema.Literal("baby-tracker-export"),
  version: Schema.Literal(1),
  exportedAt: Instant,
  migrations: Schema.Array(Schema.String),
  tables: Schema.Record(Schema.String, Schema.Array(ExportRow)),
})
export type HouseholdExport = typeof HouseholdExport.Type

const decodeExportJson = Schema.decodeUnknownOption(Schema.fromJsonString(HouseholdExport))

export const householdExportFrom = (json: string): HouseholdExport | null => Option.getOrNull(decodeExportJson(json))

export const ExportCsv = Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/csv; charset=utf-8" }))

export class ExportGroup extends HttpApiGroup.make("export")
  .add(HttpApiEndpoint.get("exportJson", "/export.json", { success: HouseholdExport }))
  .add(HttpApiEndpoint.get("exportCsv", "/export.csv", { success: ExportCsv })) {}

import { Api } from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { householdExportOf } from "./core/export.ts"

export const exportHandlers = (sql: SqlStorage) =>
  HttpApiBuilder.group(Api, "export", (handlers) =>
    handlers.handle("exportJson", () => Effect.sync(() => householdExportOf(sql, Date.now()))),
  )

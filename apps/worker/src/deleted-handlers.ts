import { Api } from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { deletedOf } from "./core/deleted.ts"

export const deletedHandlers = (sql: SqlStorage) =>
  HttpApiBuilder.group(Api, "deleted", (handlers) =>
    handlers.handle("deleted", () => Effect.sync(() => deletedOf(sql, Date.now()))),
  )

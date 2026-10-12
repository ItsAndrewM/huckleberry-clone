import { Api } from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { dayOf, monthOf, weekOf } from "./core/periods.ts"

export const periodHandlers = (sql: SqlStorage) =>
  HttpApiBuilder.group(Api, "periods", (handlers) =>
    handlers
      .handle("day", ({ params }) => Effect.sync(() => dayOf(sql, params.date, Date.now())))
      .handle("week", ({ params }) => Effect.sync(() => weekOf(sql, params.week, Date.now())))
      .handle("month", ({ params }) => Effect.sync(() => monthOf(sql, params.month, Date.now()))),
  )

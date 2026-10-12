import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Diaper } from "./diapers.ts"
import { Feed } from "./feeds.ts"
import { Measurement } from "./growth.ts"

export const RECENTLY_DELETED_DAYS = 30

export const Deleted = Schema.Struct({
  feeds: Schema.Array(Feed),
  diapers: Schema.Array(Diaper),
  measurements: Schema.Array(Measurement),
})
export type Deleted = typeof Deleted.Type

export class DeletedGroup extends HttpApiGroup.make("deleted").add(
  HttpApiEndpoint.get("deleted", "/deleted", { success: Deleted }),
) {}

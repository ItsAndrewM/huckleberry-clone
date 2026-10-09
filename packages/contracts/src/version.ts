import { Schema } from "effect"
import { ActionId } from "./action-id.ts"

export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
export type Version = typeof Version.Type

export const VersionedAction = Schema.Struct({ actionId: ActionId, version: Version })
export type VersionedAction = typeof VersionedAction.Type

import { Schema } from "effect"

export const ActionId = Schema.String.check(Schema.isUUID())
export type ActionId = typeof ActionId.Type

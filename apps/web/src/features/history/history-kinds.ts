import { flow, Option, Schema } from "effect"

export const SHOWN_KINDS = ["feeds", "diapers", "growth"] as const

export type ShownKind = (typeof SHOWN_KINDS)[number]

export type Hidden = ReadonlySet<ShownKind>

const isShownKind = (value: string): value is ShownKind => SHOWN_KINDS.some((kind) => kind === value)

export const hiddenIn = (hide: string | undefined): Hidden => new Set((hide ?? "").split(",").filter(isShownKind))

export const hideOf = (hidden: Hidden): string | undefined => {
  const listed = SHOWN_KINDS.filter((kind) => hidden.has(kind))
  return listed.length === 0 ? undefined : listed.join(",")
}

export const hideInSearch = flow(
  Schema.decodeUnknownOption(Schema.String),
  Option.flatMap((hide) => Option.fromNullishOr(hideOf(hiddenIn(hide)))),
  Option.getOrUndefined,
)

export const hiddenExcept = (shown: ReadonlyArray<string>): Hidden =>
  new Set(SHOWN_KINDS.filter((kind) => !shown.includes(kind)))

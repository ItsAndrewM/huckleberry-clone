import { Schema } from "effect"
import { IsoWeek, LocalDate, YearMonth } from "./time.ts"

const named = <const Name extends string>(name: Name) => Schema.Tuple([Schema.Literal(name)])

export const QueryKey = Schema.Union([
  named("me"),
  named("today"),
  named("last24h"),
  Schema.Tuple([Schema.Literal("day"), LocalDate]),
  Schema.Tuple([Schema.Literal("week"), IsoWeek]),
  Schema.Tuple([Schema.Literal("month"), YearMonth]),
  named("growth"),
  named("deleted"),
])
export type QueryKey = typeof QueryKey.Type

export const Changed = Schema.Array(QueryKey)
export type Changed = typeof Changed.Type

export const queryKeys = {
  me: ["me"],
  today: ["today"],
  last24h: ["last24h"],
  growth: ["growth"],
  deleted: ["deleted"],
  day: (date: LocalDate) => ["day", date] as const,
  week: (week: IsoWeek) => ["week", week] as const,
  month: (month: YearMonth) => ["month", month] as const,
} as const

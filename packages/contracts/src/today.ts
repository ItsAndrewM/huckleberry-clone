import { Schema, SchemaTransformation } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Diaper } from "./diapers.ts"
import { Feed, Millilitres, Side } from "./feeds.ts"
import { Sleep } from "./sleeps.ts"
import { Dose } from "./supplements.ts"
import { Instant, LocalDate } from "./time.ts"

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const TotalMl = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

export const Totals = Schema.Struct({
  feedsStarted: Count,
  leftSeconds: Count,
  rightSeconds: Count,
  nursingSeconds: Count,
  breastMilkMl: TotalMl,
  formulaMl: TotalMl,
  bottleMl: TotalMl,
  diapers: Count,
  wetDiapers: Count,
  dirtyDiapers: Count,
  sleepsStarted: Count,
  sleepSeconds: Count,
  napSeconds: Count,
  nightSeconds: Count,
  longestSleepSeconds: Count,
})
export type Totals = typeof Totals.Type

export const Prefill = Schema.Struct({
  lastBottle: Schema.NullOr(Schema.Struct({ breastMilkMl: Millilitres, formulaMl: Millilitres })),
  lastSide: Schema.NullOr(Side),
})
export type Prefill = typeof Prefill.Type

export const RecentEntry = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("feed"), feed: Feed }),
  Schema.Struct({ kind: Schema.Literal("diaper"), diaper: Diaper }),
  Schema.Struct({ kind: Schema.Literal("sleep"), sleep: Sleep }),
  Schema.Struct({ kind: Schema.Literal("dose"), dose: Dose }),
])
export type RecentEntry = typeof RecentEntry.Type

const isRecentEntry = Schema.is(Schema.toType(RecentEntry))

export const RecentEntries = Schema.Array(Schema.Union([...RecentEntry.members, Schema.Json])).pipe(
  Schema.decodeTo(
    Schema.Array(Schema.toType(RecentEntry)),
    SchemaTransformation.transform({
      decode: (entries): ReadonlyArray<RecentEntry> => entries.filter(isRecentEntry),
      encode: (entries) => entries,
    }),
  ),
)

export const Today = Schema.Struct({
  date: LocalDate,
  totals: Totals,
  activeFeed: Schema.NullOr(Feed),
  lastFeed: Schema.NullOr(Feed),
  activeSleep: Schema.NullOr(Sleep),
  lastSleep: Schema.NullOr(Sleep),
  prefill: Prefill,
  recent: RecentEntries,
  doses: Schema.Array(Dose),
})
export type Today = typeof Today.Type

export const Last24h = Schema.Struct({ from: Instant, totals: Totals })
export type Last24h = typeof Last24h.Type

export class TodayGroup extends HttpApiGroup.make("today")
  .add(HttpApiEndpoint.get("today", "/today", { success: Today }))
  .add(HttpApiEndpoint.get("last24h", "/last24h", { success: Last24h })) {}

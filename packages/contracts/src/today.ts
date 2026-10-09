import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Diaper } from "./diapers.ts"
import { Feed, Millilitres, Side } from "./feeds.ts"
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
])
export type RecentEntry = typeof RecentEntry.Type

export const Today = Schema.Struct({
  date: LocalDate,
  totals: Totals,
  activeFeed: Schema.NullOr(Feed),
  lastFeed: Schema.NullOr(Feed),
  prefill: Prefill,
  recent: Schema.Array(RecentEntry),
})
export type Today = typeof Today.Type

export const Last24h = Schema.Struct({ from: Instant, totals: Totals })
export type Last24h = typeof Last24h.Type

export class TodayGroup extends HttpApiGroup.make("today")
  .add(HttpApiEndpoint.get("today", "/today", { success: Today }))
  .add(HttpApiEndpoint.get("last24h", "/last24h", { success: Last24h })) {}

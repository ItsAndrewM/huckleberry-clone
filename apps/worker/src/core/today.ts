import type { Diaper, Feed, Last24h, RecentEntry, Today } from "@bt/contracts"
import { contains, type Instant, type Interval, last24hPeriod, localDateOf, totalsIn, zonedDayBounds } from "@bt/domain"
import { calendarOf } from "./calendar.ts"
import { liveDiapersSince } from "./diapers.ts"
import { lastFeed, liveFeedsSince, prefillOf } from "./feeds/reads.ts"
import { activeFeed } from "./feeds/rules.ts"

const timeOf = (entry: RecentEntry): Instant => (entry.kind === "feed" ? entry.feed.startedAt : entry.diaper.occurredAt)

const recentIn = (period: Interval, feeds: ReadonlyArray<Feed>, diapers: ReadonlyArray<Diaper>): RecentEntry[] =>
  [
    ...feeds.map((feed) => ({ kind: "feed" as const, feed })),
    ...diapers.map((diaper) => ({ kind: "diaper" as const, diaper })),
  ]
    .filter((entry) => contains(period, timeOf(entry)))
    .toSorted((a, b) => timeOf(b) - timeOf(a))

export const todayOf = (sql: SqlStorage, now: Instant): Today => {
  const { zone } = calendarOf(sql)
  const date = localDateOf(now, zone)
  const day = zonedDayBounds(date, zone)
  const last24h = last24hPeriod(now)
  const from = Math.min(day.start, last24h.start)
  const feeds = liveFeedsSince(sql, from)
  const diapers = liveDiapersSince(sql, from)
  return {
    date,
    totals: totalsIn(day, { feeds, diapers, sleeps: [] }, now),
    activeFeed: activeFeed(sql) ?? null,
    lastFeed: lastFeed(sql),
    prefill: prefillOf(sql),
    recent: recentIn(last24h, feeds, diapers),
  }
}

export const last24hOf = (sql: SqlStorage, now: Instant): Last24h => {
  const period = last24hPeriod(now)
  const entries = { feeds: liveFeedsSince(sql, period.start), diapers: liveDiapersSince(sql, period.start), sleeps: [] }
  const totals = totalsIn(period, entries, now)
  return { from: period.start, totals }
}

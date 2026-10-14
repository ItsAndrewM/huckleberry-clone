import type { Diaper, Dose, Feed, Last24h, RecentEntry, Sleep, Today } from "@bt/contracts"
import { contains, type Instant, type Interval, last24hPeriod, localDateOf, totalsIn, zonedDayBounds } from "@bt/domain"
import { calendarOf } from "./calendar.ts"
import { liveDiapersSince } from "./diapers.ts"
import { lastFeed, liveFeedsSince, prefillOf } from "./feeds/reads.ts"
import { activeFeed } from "./feeds/rules.ts"
import { lastSleep, liveSleepsSince } from "./sleeps/reads.ts"
import { activeSleep } from "./sleeps/rules.ts"
import { liveDosesSince } from "./supplements/doses.ts"

interface Logged {
  readonly feeds: ReadonlyArray<Feed>
  readonly diapers: ReadonlyArray<Diaper>
  readonly sleeps: ReadonlyArray<Sleep>
  readonly doses: ReadonlyArray<Dose>
}

const timeOf = (entry: RecentEntry): Instant => {
  switch (entry.kind) {
    case "feed":
      return entry.feed.startedAt
    case "diaper":
      return entry.diaper.occurredAt
    case "sleep":
      return entry.sleep.startedAt
    case "dose":
      return entry.dose.occurredAt
  }
}

const recentIn = (period: Interval, { feeds, diapers, sleeps, doses }: Logged): RecentEntry[] =>
  [
    ...feeds.map((feed) => ({ kind: "feed" as const, feed })),
    ...diapers.map((diaper) => ({ kind: "diaper" as const, diaper })),
    ...sleeps.map((sleep) => ({ kind: "sleep" as const, sleep })),
    ...doses.map((dose) => ({ kind: "dose" as const, dose })),
  ]
    .filter((entry) => contains(period, timeOf(entry)))
    .toSorted((a, b) => timeOf(b) - timeOf(a))

export const todayOf = (sql: SqlStorage, now: Instant): Today => {
  const { zone } = calendarOf(sql)
  const date = localDateOf(now, zone)
  const day = zonedDayBounds(date, zone)
  const last24h = last24hPeriod(now)
  const from = Math.min(day.start, last24h.start)
  const logged = {
    feeds: liveFeedsSince(sql, from),
    diapers: liveDiapersSince(sql, from),
    sleeps: liveSleepsSince(sql, from),
  }
  const doses = liveDosesSince(sql, from)
  return {
    date,
    totals: totalsIn(day, logged, now),
    activeFeed: activeFeed(sql) ?? null,
    lastFeed: lastFeed(sql),
    activeSleep: activeSleep(sql) ?? null,
    lastSleep: lastSleep(sql),
    prefill: prefillOf(sql),
    recent: recentIn(last24h, { ...logged, doses }),
    doses: doses.filter((dose) => contains(day, dose.occurredAt)),
  }
}

export const last24hOf = (sql: SqlStorage, now: Instant): Last24h => {
  const period = last24hPeriod(now)
  const entries = {
    feeds: liveFeedsSince(sql, period.start),
    diapers: liveDiapersSince(sql, period.start),
    sleeps: liveSleepsSince(sql, period.start),
  }
  const totals = totalsIn(period, entries, now)
  return { from: period.start, totals }
}

import type { Feed, Prefill, Side } from "@bt/contracts"
import { feedTouches, type Instant, type Interval } from "@bt/domain"
import { loadFeed } from "./store.ts"

type BottleRow = { breast_milk_ml: number; formula_ml: number }

const loaded = (sql: SqlStorage, rows: ReadonlyArray<{ readonly id: string }>): Feed[] =>
  rows.flatMap(({ id }) => loadFeed(sql, id) ?? [])

export const liveFeedsSince = (sql: SqlStorage, from: Instant): Feed[] =>
  loaded(
    sql,
    sql
      .exec<{ id: string }>(
        "SELECT id FROM feeds WHERE deleted_at IS NULL AND (ended_at IS NULL OR ended_at >= ?) ORDER BY started_at, rowid",
        from,
      )
      .toArray(),
  )

export const liveFeedsTouching = (sql: SqlStorage, period: Interval, now: Instant): Feed[] =>
  loaded(
    sql,
    sql
      .exec<{ id: string }>(
        `SELECT id FROM feeds WHERE deleted_at IS NULL AND started_at < ? AND (ended_at IS NULL OR ended_at >= ?)
         ORDER BY started_at, rowid`,
        period.end,
        period.start,
      )
      .toArray(),
  ).filter((feed) => feedTouches(period, feed, now))

export const deletedFeedsSince = (sql: SqlStorage, since: Instant): Feed[] =>
  loaded(
    sql,
    sql
      .exec<{ id: string }>("SELECT id FROM feeds WHERE deleted_at >= ? ORDER BY deleted_at DESC, rowid DESC", since)
      .toArray(),
  )

export const lastFeed = (sql: SqlStorage): Feed | null => {
  const rows = sql
    .exec<{ id: string }>("SELECT id FROM feeds WHERE deleted_at IS NULL ORDER BY started_at DESC, rowid DESC LIMIT 1")
    .toArray()
  return loaded(sql, rows)[0] ?? null
}

export const prefillOf = (sql: SqlStorage): Prefill => {
  const [bottle] = sql
    .exec<BottleRow>(
      `SELECT p.breast_milk_ml, p.formula_ml FROM bottle_portions p JOIN feeds f ON f.id = p.feed_id
       WHERE p.deleted_at IS NULL AND f.deleted_at IS NULL ORDER BY p.occurred_at DESC, p.rowid DESC LIMIT 1`,
    )
    .toArray()
  const [segment] = sql
    .exec<{ side: Side }>(
      `SELECT s.side FROM nursing_segments s JOIN feeds f ON f.id = s.feed_id
       WHERE s.deleted_at IS NULL AND f.deleted_at IS NULL ORDER BY s.started_at DESC, s.rowid DESC LIMIT 1`,
    )
    .toArray()
  return {
    lastBottle: bottle === undefined ? null : { breastMilkMl: bottle.breast_milk_ml, formulaMl: bottle.formula_ml },
    lastSide: segment?.side ?? null,
  }
}

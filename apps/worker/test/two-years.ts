const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export const TWO_YEARS = { days: 730, feedsADay: 12, diapersADay: 10, deletedFeedEvery: 50 } as const

const insertFeed = (sql: SqlStorage, who: string, at: number, deletedAt: number | null) => {
  const feedId = crypto.randomUUID()
  sql.exec(
    `INSERT INTO feeds (id, status, started_at, ended_at, version, source, created_by, created_at, updated_by, updated_at, deleted_at)
     VALUES (?, 'completed', ?, ?, 1, 'app', ?, ?, ?, ?, ?)`,
    feedId,
    at,
    at + 25 * MINUTE_MS,
    who,
    at,
    who,
    at,
    deletedAt,
  )
  for (const [side, from] of [
    ["left", 0],
    ["right", 10],
  ] as const) {
    sql.exec(
      `INSERT INTO nursing_segments (id, feed_id, side, started_at, ended_at, source, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, 'app', ?, ?, ?, ?)`,
      crypto.randomUUID(),
      feedId,
      side,
      at + from * MINUTE_MS,
      at + (from + 10) * MINUTE_MS,
      who,
      at,
      who,
      at,
    )
  }
  sql.exec(
    `INSERT INTO bottle_portions (id, feed_id, occurred_at, breast_milk_ml, formula_ml, source, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, 60, 0, 'app', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    feedId,
    at + 25 * MINUTE_MS,
    who,
    at,
    who,
    at,
  )
}

const insertDiaper = (sql: SqlStorage, who: string, at: number, dirty: boolean) =>
  sql.exec(
    `INSERT INTO diapers (id, occurred_at, wet, dirty, version, source, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, 1, ?, 1, 'app', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    at,
    dirty ? 1 : 0,
    who,
    at,
    who,
    at,
  )

const insertMeasurement = (sql: SqlStorage, who: string, at: number, day: number) =>
  sql.exec(
    `INSERT INTO growth_measurements (id, measured_at, weight_g, length_cm, head_cm, version, source, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'app', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    at,
    3500 + day * 12,
    50 + day * 0.04,
    34 + day * 0.015,
    who,
    at,
    who,
    at,
  )

const seedDay = (sql: SqlStorage, who: string, dayStart: number, day: number) => {
  for (let feed = 0; feed < TWO_YEARS.feedsADay; feed++) {
    const at = dayStart + feed * 120 * MINUTE_MS
    const count = day * TWO_YEARS.feedsADay + feed
    insertFeed(sql, who, at, count % TWO_YEARS.deletedFeedEvery === 0 ? at + 60 * MINUTE_MS : null)
  }
  for (let diaper = 0; diaper < TWO_YEARS.diapersADay; diaper++) {
    insertDiaper(sql, who, dayStart + diaper * 144 * MINUTE_MS + 30 * MINUTE_MS, diaper % 3 === 0)
  }
  if (day % 7 === 0) insertMeasurement(sql, who, dayStart + 10 * 60 * MINUTE_MS, day)
}

export const seedTwoYears = (sql: SqlStorage, end: number) => {
  const who = sql.exec<{ id: string }>("SELECT id FROM caregivers ORDER BY rowid LIMIT 1").one().id
  const start = end - TWO_YEARS.days * DAY_MS
  for (let day = 0; day < TWO_YEARS.days; day++) seedDay(sql, who, start + day * DAY_MS, day)
}

export const rowCounts = (sql: SqlStorage) =>
  ["feeds", "nursing_segments", "bottle_portions", "diapers", "growth_measurements"].map(
    (table) => [table, sql.exec<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).one().n] as const,
  )

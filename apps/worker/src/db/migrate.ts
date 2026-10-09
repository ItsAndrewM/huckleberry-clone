export interface Migration {
  readonly name: string
  readonly sql: string
}

const LEDGER = `CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
) STRICT`

export const migrate = (storage: DurableObjectStorage, migrations: ReadonlyArray<Migration>, now: number): void => {
  storage.sql.exec(LEDGER)
  const { applied } = storage.sql.exec<{ applied: number }>("SELECT count(*) AS applied FROM _migrations").one()
  migrations.slice(applied).forEach(({ name, sql }, index) =>
    storage.transactionSync(() => {
      storage.sql.exec(sql)
      storage.sql.exec(
        "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)",
        applied + index + 1,
        name,
        now,
      )
    }),
  )
}

import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { migrate } from "../src/db/migrate.ts"
import { MIGRATIONS } from "../src/db/migrations.ts"
import { newHousehold } from "./fixtures.ts"

const inHousehold = <R>(run: (storage: DurableObjectStorage) => R) =>
  runInDurableObject(newHousehold(), (_instance, state) => run(state.storage))

const tables = (storage: DurableObjectStorage) =>
  storage.sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB '_cf_*' ORDER BY name",
    )
    .toArray()
    .map(({ name }) => name)

const ledger = (storage: DurableObjectStorage) =>
  storage.sql.exec<{ id: number; name: string }>("SELECT id, name FROM _migrations ORDER BY id").toArray()

const numbered = (position: number, name: string) => `${String(position).padStart(4, "0")}-${name}`

const APPLIED = MIGRATIONS.map(({ name }, index) => ({ id: index + 1, name }))

const probe = {
  name: numbered(MIGRATIONS.length + 1, "probe"),
  sql: "CREATE TABLE probe (id INTEGER PRIMARY KEY) STRICT",
}

describe("migrations", () => {
  it("are numbered from 0001, one per file, in the order they apply", () => {
    expect(MIGRATIONS.map(({ name }) => name.slice(0, 5))).toEqual(MIGRATIONS.map((_, i) => numbered(i + 1, "")))
  })

  it("give a new household every table, each migration applied once", async () => {
    const { names, applied } = await inHousehold((storage) => ({ names: tables(storage), applied: ledger(storage) }))
    expect(names).toEqual(["_migrations", "caregivers", "child", "diapers", "household", "receipts"])
    expect(applied).toEqual(APPLIED)
  })

  it("apply only the ones a household hasn't seen, and nothing the second time", async () => {
    const applied = await inHousehold((storage) => {
      migrate(storage, [...MIGRATIONS, probe], Date.now())
      migrate(storage, [...MIGRATIONS, probe], Date.now())
      return { names: tables(storage), ledger: ledger(storage) }
    })
    expect(applied.names).toContain("probe")
    expect(applied.ledger).toEqual([...APPLIED, { id: MIGRATIONS.length + 1, name: probe.name }])
  })

  it("roll back a migration that fails partway, with its ledger row", async () => {
    const broken = {
      name: numbered(MIGRATIONS.length + 1, "broken"),
      sql: "CREATE TABLE half (id INTEGER PRIMARY KEY) STRICT; CREATE TABLE oops (",
    }
    const after = await inHousehold((storage) => {
      expect(() => migrate(storage, [...MIGRATIONS, broken], Date.now())).toThrow("incomplete input")
      return { names: tables(storage), ledger: ledger(storage) }
    })
    expect(after.names).not.toContain("half")
    expect(after.ledger).toEqual(APPLIED)
  })

  it("refuse to start a household whose ledger doesn't match the code, instead of skipping a moved migration", async () => {
    const position = MIGRATIONS.length + 1
    const rerunnable = {
      name: numbered(position, "rerunnable"),
      sql: "CREATE TABLE IF NOT EXISTS rerunnable (id INTEGER PRIMARY KEY) STRICT",
    }
    const moved = { name: numbered(position, "moved"), sql: "CREATE TABLE moved (id INTEGER PRIMARY KEY) STRICT" }
    const after = await inHousehold((storage) => {
      migrate(storage, [...MIGRATIONS, rerunnable], Date.now())
      expect(() => migrate(storage, [...MIGRATIONS, moved, rerunnable], Date.now())).toThrow(
        `Migration ${position} is "${rerunnable.name}" in this household, but "${moved.name}" in the code`,
      )
      return { names: tables(storage), ledger: ledger(storage) }
    })
    expect(after.names).not.toContain("moved")
    expect(after.ledger).toEqual([...APPLIED, { id: position, name: rerunnable.name }])
  })

  it("start older code against a household that has newer migrations, as after a rollback", async () => {
    const after = await inHousehold((storage) => {
      migrate(storage, [...MIGRATIONS, probe], Date.now())
      migrate(storage, MIGRATIONS, Date.now())
      return ledger(storage)
    })
    expect(after).toEqual([...APPLIED, { id: MIGRATIONS.length + 1, name: probe.name }])
  })
})

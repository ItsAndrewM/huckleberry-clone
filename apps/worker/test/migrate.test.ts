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

const probe = { name: "0002-probe", sql: "CREATE TABLE probe (id INTEGER PRIMARY KEY) STRICT" }

describe("migrations", () => {
  it("are numbered from 0001, one per file, in the order they apply", () => {
    expect(MIGRATIONS.map(({ name }) => name.slice(0, 5))).toEqual(
      MIGRATIONS.map((_, i) => `${String(i + 1).padStart(4, "0")}-`),
    )
  })

  it("give a new household every table in 0001, applied once", async () => {
    const { names, applied } = await inHousehold((storage) => ({ names: tables(storage), applied: ledger(storage) }))
    expect(names).toEqual(["_migrations", "caregivers", "child", "household", "receipts"])
    expect(applied).toEqual([{ id: 1, name: "0001-household" }])
  })

  it("apply only the ones a household hasn't seen, and nothing the second time", async () => {
    const applied = await inHousehold((storage) => {
      migrate(storage, [...MIGRATIONS, probe], Date.now())
      migrate(storage, [...MIGRATIONS, probe], Date.now())
      return { names: tables(storage), ledger: ledger(storage) }
    })
    expect(applied.names).toContain("probe")
    expect(applied.ledger).toEqual([
      { id: 1, name: "0001-household" },
      { id: 2, name: "0002-probe" },
    ])
  })

  it("roll back a migration that fails partway, with its ledger row", async () => {
    const broken = {
      name: "0002-broken",
      sql: "CREATE TABLE half (id INTEGER PRIMARY KEY) STRICT; CREATE TABLE oops (",
    }
    const after = await inHousehold((storage) => {
      expect(() => migrate(storage, [...MIGRATIONS, broken], Date.now())).toThrow("incomplete input")
      return { names: tables(storage), ledger: ledger(storage) }
    })
    expect(after.names).not.toContain("half")
    expect(after.ledger).toEqual([{ id: 1, name: "0001-household" }])
  })
})

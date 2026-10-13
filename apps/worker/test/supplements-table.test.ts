import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { migrate } from "../src/db/migrate.ts"
import { MIGRATIONS } from "../src/db/migrations.ts"
import { ANDREW, caregiverId, inHousehold, NOW, seededHousehold } from "./fixtures.ts"

const SUPPLEMENTS_MIGRATION = MIGRATIONS.findIndex(({ name }) => name === "0008-supplements") + 1

const supplementNames = (sql: SqlStorage) =>
  sql
    .exec<{ name: string; dose: string; created_by: string | null }>(
      "SELECT name, dose, created_by FROM supplements ORDER BY rowid",
    )
    .toArray()

const insertSupplement = (sql: SqlStorage, name: string, dose: string) =>
  sql.exec(
    "INSERT INTO supplements (id, name, dose, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    crypto.randomUUID(),
    name,
    dose,
    NOW,
    NOW,
  )

const insertDose = (sql: SqlStorage, supplementId: string, localDate: string) => {
  const andrew = caregiverId(sql, ANDREW.email)
  sql.exec(
    `INSERT INTO supplement_logs
       (id, supplement_id, occurred_at, local_date, dose, version, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, '400 IU', 1, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    supplementId,
    NOW,
    localDate,
    andrew,
    NOW,
    andrew,
    NOW,
  )
}

describe("0008-supplements", () => {
  it("gives a household that came before it Vitamin D at 400 IU once, with no author", async () => {
    const household = await seededHousehold()
    const after = await runInDurableObject(household, (_instance, state) => {
      const { storage } = state
      storage.sql.exec("DROP TABLE supplement_logs")
      storage.sql.exec("DROP TABLE supplements")
      storage.sql.exec("DELETE FROM _migrations WHERE id = ?", SUPPLEMENTS_MIGRATION)
      migrate(storage, MIGRATIONS, NOW)
      migrate(storage, MIGRATIONS, NOW)
      return supplementNames(storage.sql)
    })
    expect(after).toEqual([{ name: "Vitamin D", dose: "400 IU", created_by: null }])
  })
})

describe("the supplements tables", () => {
  it("refuse a supplement with no name or a dose longer than 40 characters", async () => {
    await inHousehold((sql) => {
      expect(() => insertSupplement(sql, "", "1 mL")).toThrow("CHECK constraint failed")
      expect(() => insertSupplement(sql, "Iron", "x".repeat(41))).toThrow("CHECK constraint failed")
    })
  })

  it("refuse a dose of a supplement the household doesn't hold, or with a date that isn't one", async () => {
    await inHousehold((sql) => {
      const [vitaminD] = sql.exec<{ id: string }>("SELECT id FROM supplements").toArray()
      if (vitaminD === undefined) throw new Error("expected the seeded Vitamin D")
      expect(() => insertDose(sql, "no-such-supplement", "2026-10-08")).toThrow("FOREIGN KEY constraint failed")
      expect(() => insertDose(sql, vitaminD.id, "8 Oct 2026")).toThrow("CHECK constraint failed")
      insertDose(sql, vitaminD.id, "2026-10-08")
    })
  })
})

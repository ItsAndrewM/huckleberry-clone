import { describe, expect, it } from "vitest"
import type { ExportRow, HouseholdExport } from "../packages/contracts/src/export.ts"
import { dryRun, dryRunSummary, migrationsOnDisk } from "./migration-dry-run.ts"

const NOW = Date.UTC(2026, 9, 13, 16)
const HOUR_MS = 3_600_000
const ANDREW = "caregiver-andrew"
const EMILY = "caregiver-emily"

const MIGRATIONS = migrationsOnDisk()
const BEFORE_SLEEPS = MIGRATIONS.slice(0, 6)

const caregiver = (id: string, email: string, displayName: string): ExportRow => ({
  id,
  email,
  display_name: displayName,
  active: 1,
  created_at: NOW,
  updated_at: NOW,
})

const diaper = (createdBy: string): ExportRow => ({
  id: "diaper-1",
  occurred_at: NOW - HOUR_MS,
  wet: 1,
  dirty: 0,
  version: 1,
  source: "app",
  source_ref: null,
  created_by: createdBy,
  created_at: NOW,
  updated_by: createdBy,
  updated_at: NOW,
  deleted_at: null,
})

const tablesWith = (diapers: ReadonlyArray<ExportRow>) => ({
  bottle_portions: [],
  caregivers: [caregiver(ANDREW, "andrew@example.test", "Andrew"), caregiver(EMILY, "emily@example.test", "Emily")],
  child: [
    {
      id: 1,
      name: "Robin",
      birth_date: "2026-09-01",
      sex: "female",
      gestational_age_days: 281,
      created_at: NOW,
      updated_at: NOW,
      version: 1,
      updated_by: null,
    },
  ],
  diapers,
  feeds: [],
  growth_measurements: [],
  household: [
    {
      id: 1,
      name: "Test household",
      time_zone: "America/Vancouver",
      created_at: NOW,
      updated_at: NOW,
      volume_unit: "ml",
      weight_unit: "kg",
      length_unit: "cm",
      version: 1,
      updated_by: ANDREW,
    },
  ],
  nursing_segments: [],
})

const exportOf = (migrations: ReadonlyArray<string>, tables = tablesWith([diaper(EMILY)])): HouseholdExport => ({
  format: "baby-tracker-export",
  version: 1,
  exportedAt: NOW,
  migrations,
  tables,
})

const names = (migrations: ReadonlyArray<{ readonly name: string }>) => migrations.map(({ name }) => name)

describe("migrationsOnDisk", () => {
  it("reads the Worker's migration files in the order they apply", () => {
    expect(names(MIGRATIONS).slice(0, 7)).toEqual([
      "0001-household",
      "0002-receipt-routes",
      "0003-diapers",
      "0004-feeds",
      "0005-household-settings",
      "0006-growth",
      "0007-sleeps",
    ])
  })
})

describe("dryRun", () => {
  it("applies the migrations an export hasn't seen on top of its rows, keeping every row", () => {
    expect(dryRun(exportOf(names(BEFORE_SLEEPS)), MIGRATIONS)).toEqual({
      applied: names(MIGRATIONS.slice(6)),
      rows: 5,
      tables: 8,
    })
  })

  it("applies nothing to an export that has every migration", () => {
    const tables = { ...tablesWith([diaper(EMILY)]), sleeps: [] }
    expect(dryRun(exportOf(names(MIGRATIONS), tables), MIGRATIONS).applied).toEqual([])
  })

  it("refuses an export whose migrations don't match the code's", () => {
    expect(() => dryRun(exportOf(["0001-household", "0002-receipts"]), MIGRATIONS)).toThrow(
      `The export's migration 2 is "0002-receipts", but the code's is "0002-receipt-routes"`,
    )
  })

  it("fails when a pending migration fails", () => {
    const broken = [...BEFORE_SLEEPS, { name: "0007-broken", sql: "CREATE TABLE broken (" }]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), broken)).toThrow("incomplete input")
  })

  it("fails when a pending migration loses rows", () => {
    const forgetful = [...BEFORE_SLEEPS, { name: "0007-forgetful", sql: "DELETE FROM diapers" }]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), forgetful)).toThrow("diapers had 1 rows, but 0 are left")
  })

  it("fails when a row points at a caregiver the export doesn't hold", () => {
    const orphaned = exportOf(names(BEFORE_SLEEPS), tablesWith([diaper("caregiver-gone")]))
    expect(() => dryRun(orphaned, MIGRATIONS)).toThrow("2 references point at rows that aren't there")
  })
})

describe("dryRunSummary", () => {
  it("names what it applied and the rows it kept", () => {
    expect(dryRunSummary({ applied: ["0007-sleeps"], rows: 5, tables: 8 })).toBe(
      "Applied 0007-sleeps on top of the export: all 5 rows of its 8 tables are still there, and every reference still holds.",
    )
  })

  it("says when there was nothing to apply", () => {
    expect(dryRunSummary({ applied: [], rows: 5, tables: 9 })).toBe(
      "The export already has every migration, so there was nothing to apply.",
    )
  })
})

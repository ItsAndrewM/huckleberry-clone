import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { ExportRow, HouseholdExport } from "../packages/contracts/src/export.ts"
import { dryRun, dryRunSummary, migrationsOnDisk } from "./migration-dry-run.ts"

const NOW = Date.UTC(2026, 9, 13, 16)
const HOUR_MS = 3_600_000
const ANDREW = "caregiver-andrew"
const EMILY = "caregiver-emily"

const MIGRATIONS = migrationsOnDisk()
const BEFORE_SLEEPS = MIGRATIONS.slice(0, 6)
const REGISTRY = readFileSync(new URL("../apps/worker/src/db/migrations.ts", import.meta.url), "utf8")
const CLI = fileURLToPath(new URL("./dry-run-migrations.ts", import.meta.url))

const REBUILD_CAREGIVERS = [
  "CREATE TABLE caregivers_rebuilt (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, active INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT",
  "INSERT INTO caregivers_rebuilt SELECT id, email, display_name, active, created_at, updated_at FROM caregivers",
  "DROP TABLE caregivers",
  "ALTER TABLE caregivers_rebuilt RENAME TO caregivers",
].join(";\n")

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

const exportOf = (
  migrations: ReadonlyArray<string>,
  tables: HouseholdExport["tables"] = tablesWith([diaper(EMILY)]),
): HouseholdExport => ({
  format: "baby-tracker-export",
  version: 1,
  exportedAt: NOW,
  migrations,
  tables,
})

const names = (migrations: ReadonlyArray<{ readonly name: string }>) => migrations.map(({ name }) => name)

const tablesWithout = (...left: ReadonlyArray<string>) =>
  Object.fromEntries(Object.entries(tablesWith([diaper(EMILY)])).filter(([table]) => !left.includes(table)))

const without = (row: ExportRow, column: string): ExportRow =>
  Object.fromEntries(Object.entries(row).filter(([name]) => name !== column))

const registered = () => {
  const files = new Map(
    [...REGISTRY.matchAll(/import (\w+) from "\.\/migrations\/([^"]+)\.sql"/gu)].map(
      ([, variable = "", file = ""]) => [variable, file] as const,
    ),
  )
  return [...REGISTRY.matchAll(/\{ name: "([^"]+)", sql: (\w+) \}/gu)].map(([, name = "", variable = ""]) => ({
    name,
    file: files.get(variable),
  }))
}

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

  it("returns the ones the Worker registers, each from its own file, so a file added but never registered fails here", () => {
    expect(registered()).toEqual(names(MIGRATIONS).map((name) => ({ name, file: name })))
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

  it("loads every row before it enforces references, so a table may come before the one it points at", () => {
    const diapersFirst = { diapers: [diaper(EMILY)], ...tablesWithout("diapers") }
    expect(dryRun(exportOf(names(BEFORE_SLEEPS), diapersFirst), MIGRATIONS)).toEqual({
      applied: names(MIGRATIONS.slice(6)),
      rows: 5,
      tables: 8,
    })
  })

  it("refuses an export that has every migration, since nothing would be applied", () => {
    const tables = { ...tablesWith([diaper(EMILY)]), sleeps: [] }
    expect(() => dryRun(exportOf(names(MIGRATIONS), tables), MIGRATIONS)).toThrow(
      "The export already has every migration, so there was nothing to apply.",
    )
  })

  it("refuses an export whose migrations don't match the code's", () => {
    expect(() => dryRun(exportOf(["0001-household", "0002-receipts"]), MIGRATIONS)).toThrow(
      `The export's migration 2 is "0002-receipts", but the code's is "0002-receipt-routes"`,
    )
  })

  it.each([
    ["no tables", {}],
    ["only empty tables", Object.fromEntries(Object.keys(tablesWith([])).map((table) => [table, []]))],
  ])("refuses an export with %s, which has no rows to test a migration against", (_label, tables) => {
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS), tables), MIGRATIONS)).toThrow(
      "The export holds no rows, so there's nothing to test a migration against",
    )
  })

  it("refuses an export that leaves out tables its migrations create, naming each", () => {
    const tables = tablesWithout("feeds", "growth_measurements")
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS), tables), MIGRATIONS)).toThrow(
      "Tables its migrations create are missing from the export: feeds, growth_measurements",
    )
  })

  it("refuses an export that holds tables its migrations don't create, naming each", () => {
    const tables = { ...tablesWith([diaper(EMILY)]), notes: [], extras: [] }
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS), tables), MIGRATIONS)).toThrow(
      "The export holds tables its migrations don't create: notes, extras",
    )
  })

  it("names both sides when a table was renamed", () => {
    const tables = { ...tablesWithout("feeds"), meals: [] }
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS), tables), MIGRATIONS)).toThrow(
      "Tables its migrations create are missing from the export: feeds. The export holds tables its migrations don't create: meals",
    )
  })

  it("refuses rows that lack a column the rebuilt table has, as after an edit to an applied migration file", () => {
    const edited = MIGRATIONS.map((migration) =>
      migration.name === "0003-diapers"
        ? { ...migration, sql: migration.sql.replace("deleted_at INTEGER,", "deleted_at INTEGER, notes TEXT,") }
        : migration,
    )
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), edited)).toThrow(
      "The export's diapers rows lack columns its migrations create: notes",
    )
  })

  it("accepts rows that lack a column a pending migration adds, since the columns are checked before it runs", () => {
    const widening = [...BEFORE_SLEEPS, { name: "0007-notes", sql: "ALTER TABLE diapers ADD COLUMN notes TEXT" }]
    expect(dryRun(exportOf(names(BEFORE_SLEEPS)), widening)).toEqual({ applied: ["0007-notes"], rows: 5, tables: 8 })
  })

  it("refuses a row that lacks a column its siblings have", () => {
    const diapers = [diaper(EMILY), { ...without(diaper(EMILY), "deleted_at"), id: "diaper-2" }]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS), tablesWith(diapers)), MIGRATIONS)).toThrow(
      "The export's diapers rows lack columns its migrations create: deleted_at",
    )
  })

  it("refuses rows that have a column its migrations don't create, without repeating a value", () => {
    const diapers = [{ ...diaper(EMILY), colour: "yellow" }]
    const run = () => dryRun(exportOf(names(BEFORE_SLEEPS), tablesWith(diapers)), MIGRATIONS)
    expect(run).toThrow("The export's diapers rows have columns its migrations don't create: colour")
    expect(run).not.toThrow("yellow")
  })

  it("names the table whose rows won't load, without repeating a value", () => {
    const shouting = [
      caregiver(ANDREW, "ANDREW@EXAMPLE.TEST", "Andrew"),
      caregiver(EMILY, "emily@example.test", "Emily"),
    ]
    const tables = { ...tablesWith([diaper(EMILY)]), caregivers: shouting }
    const run = () => dryRun(exportOf(names(BEFORE_SLEEPS), tables), MIGRATIONS)
    expect(run).toThrow("Loading the export's caregivers rows failed: CHECK constraint failed: email = lower(email)")
    expect(run).not.toThrow("ANDREW@EXAMPLE.TEST")
  })

  it("fails when a row points at a caregiver the export doesn't hold, naming the tables, before any migration", () => {
    const orphaned = exportOf(names(BEFORE_SLEEPS), tablesWith([diaper("caregiver-gone")]))
    const run = () => dryRun(orphaned, MIGRATIONS)
    expect(run).toThrow("The export already has references that point at rows that aren't there: diapers -> caregivers")
    expect(run).not.toThrow("caregiver-gone")
  })

  it("fails when a pending migration fails, naming it", () => {
    const broken = [...BEFORE_SLEEPS, { name: "0007-broken", sql: "CREATE TABLE broken (" }]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), broken)).toThrow(
      "The migration 0007-broken failed: incomplete input",
    )
  })

  it("names an applied migration whose file no longer builds its tables", () => {
    const edited = MIGRATIONS.map((migration) =>
      migration.name === "0003-diapers" ? { ...migration, sql: "CREATE TABLE diapers (" } : migration,
    )
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), edited)).toThrow(
      "The migration 0003-diapers failed: incomplete input",
    )
  })

  it("names the pending migration that failed when others ran before it", () => {
    const pending = [
      { name: "0007-fine", sql: "CREATE TABLE fine (id INTEGER PRIMARY KEY) STRICT" },
      { name: "0008-broken", sql: "CREATE TABLE broken (" },
    ]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), [...BEFORE_SLEEPS, ...pending])).toThrow(
      "The migration 0008-broken failed: incomplete input",
    )
  })

  it("fails when a pending migration loses rows", () => {
    const forgetful = [...BEFORE_SLEEPS, { name: "0007-forgetful", sql: "DELETE FROM diapers" }]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), forgetful)).toThrow("diapers had 1 rows, but 0 are left")
  })

  it("fails when a pending migration adds rows, since a table's row count must not change", () => {
    const eager = [
      ...BEFORE_SLEEPS,
      {
        name: "0007-eager",
        sql: `INSERT INTO caregivers VALUES ('caregiver-new', 'new@example.test', 'New', 1, ${NOW}, ${NOW})`,
      },
    ]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), eager)).toThrow("caregivers had 2 rows, but 3 are left")
  })

  it.each([
    ["rebuilds the table its rows point at", REBUILD_CAREGIVERS, "FOREIGN KEY constraint failed"],
    [
      "adds a reference with a default",
      "ALTER TABLE caregivers ADD COLUMN reviewed_by TEXT NOT NULL DEFAULT 'caregiver-andrew' REFERENCES caregivers (id)",
      "Cannot add a REFERENCES column with non-NULL default value",
    ],
    [
      "breaks a deferred reference, which only the commit finds",
      "CREATE TABLE audit (id INTEGER PRIMARY KEY, who TEXT REFERENCES caregivers (id) DEFERRABLE INITIALLY DEFERRED) STRICT; INSERT INTO audit VALUES (1, 'nobody')",
      "FOREIGN KEY constraint failed",
    ],
  ])("fails when a pending migration %s, as the Durable Object's foreign keys would", (_label, sql, reason) => {
    const probe = [...BEFORE_SLEEPS, { name: "0007-probe", sql }]
    expect(() => dryRun(exportOf(names(BEFORE_SLEEPS)), probe)).toThrow(`The migration 0007-probe failed: ${reason}`)
  })
})

describe("dryRunSummary", () => {
  it("names what it applied and the rows it kept", () => {
    expect(dryRunSummary({ applied: ["0007-sleeps"], rows: 5, tables: 8 })).toBe(
      "Applied 0007-sleeps on top of the export: all 5 rows of its 8 tables are still there, and every reference still holds.",
    )
  })
})

describe("pnpm migrations:dry-run", () => {
  const homeHolding = (file: string, body: string) => {
    const home = mkdtempSync(join(tmpdir(), "bt-dry-run-"))
    writeFileSync(join(home, file), body)
    return home
  }

  const inHome = (home: string, ...args: ReadonlyArray<string>) =>
    spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, HOME: home }, encoding: "utf8" })

  it("reads a leading ~ as the home folder, as the shell does only for an unquoted path, and says what it applied", () => {
    const home = homeHolding("baby-tracker.json", JSON.stringify(exportOf(names(BEFORE_SLEEPS))))
    const { status, stdout } = inHome(home, "~/baby-tracker.json")
    expect(stdout).toBe(`${dryRunSummary({ applied: names(MIGRATIONS.slice(6)), rows: 5, tables: 8 })}\n`)
    expect(status).toBe(0)
  })

  it("exits 1 and says why when the export already has every migration", () => {
    const tables = { ...tablesWith([diaper(EMILY)]), sleeps: [] }
    const home = homeHolding("baby-tracker.json", JSON.stringify(exportOf(names(MIGRATIONS), tables)))
    const { status, stdout, stderr } = inHome(home, "~/baby-tracker.json")
    expect(stderr).toContain("The export already has every migration, so there was nothing to apply.")
    expect(stdout).toBe("")
    expect(status).toBe(1)
  })

  it("exits 1 for a file that isn't an export, without repeating what's in it", () => {
    const home = homeHolding("notes.json", JSON.stringify({ secret: "Robin" }))
    const { status, stderr } = inHome(home, "~/notes.json")
    expect(stderr).toContain(`${join(home, "notes.json")} isn't a household export`)
    expect(stderr).not.toContain("Robin")
    expect(status).toBe(1)
  })

  it.each([
    ["no file", []],
    ["two files", ["~/a.json", "~/b.json"]],
  ])("exits 1 and says how to call it, given %s", (_label, args) => {
    const { status, stderr } = inHome(mkdtempSync(join(tmpdir(), "bt-dry-run-")), ...args)
    expect(stderr).toContain("Give one export, like: pnpm migrations:dry-run ~/baby-tracker.json")
    expect(status).toBe(1)
  })
})

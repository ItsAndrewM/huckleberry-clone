import { DoseConflict, InvalidInput, type NewDose, NotFound } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { editChild, editHousehold } from "../src/core/household-edits.ts"
import { addSupplement, editSupplement, supplementsOf } from "../src/core/supplements/definitions.ts"
import { deleteDose, editDose, logDose, restoreDose } from "../src/core/supplements/dose-writes.ts"
import {
  ACTION_ID,
  ANDREW,
  CHANGED_TODAY,
  caregiverId,
  EMILY,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  movedBirthDate,
  NOW,
  OCT_1_AT_00_30,
  SEED,
  SEP_3_BEGINS,
  SEP_30_AT_23_30,
  saved,
  stampOf,
} from "./fixtures.ts"

const vitaminDOf = (sql: SqlStorage) => {
  const [vitaminD] = supplementsOf(sql)
  if (vitaminD === undefined) throw new Error("expected the seeded Vitamin D")
  return vitaminD
}

const doseOf = (supplementId: string, occurredAt = minutesAgo(60), confirmedDuplicate = false): NewDose => ({
  actionId: crypto.randomUUID(),
  supplementId,
  occurredAt,
  confirmedDuplicate,
})

const dosed = (sql: SqlStorage, occurredAt = minutesAgo(60), confirmedDuplicate = false, email = ANDREW.email) =>
  saved(logDose(stampOf(sql, email), doseOf(vitaminDOf(sql).id, occurredAt, confirmedDuplicate))(sql))

const versioned = (version: number) => ({ actionId: crypto.randomUUID(), version })

const doseRows = (sql: SqlStorage) => sql.exec("SELECT id FROM supplement_logs").toArray().length

describe("logging a dose", () => {
  it("saves it as version 1 under the household's date then, with its supplement's dose, stamped with who logged it", async () => {
    const { result, vitaminD, andrew } = await inHousehold((sql) => ({
      result: logDose(stampOf(sql), doseOf(vitaminDOf(sql).id))(sql),
      vitaminD: vitaminDOf(sql),
      andrew: caregiverId(sql, ANDREW.email),
    }))
    expect(result).toEqual({
      ok: true,
      response: {
        id: expect.any(String),
        supplementId: vitaminD.id,
        occurredAt: minutesAgo(60),
        localDate: "2026-10-08",
        dose: "400 IU",
        version: 1,
        createdBy: andrew,
        createdAt: NOW,
        updatedBy: andrew,
        updatedAt: NOW,
        deletedAt: null,
      },
      changed: CHANGED_TODAY,
    })
  })

  it("files a dose either side of midnight under the household's date, not UTC's", async () => {
    const dates = await inHousehold((sql) => [
      dosed(sql, SEP_30_AT_23_30).localDate,
      dosed(sql, OCT_1_AT_00_30).localDate,
    ])
    expect(dates).toEqual(["2026-09-30", "2026-10-01"])
  })

  it("refuses a second dose of a supplement on the same date with SUPPLEMENT_DUPLICATE_DAY and the dose already logged, saving nothing", async () => {
    const { first, second, rows } = await inHousehold((sql) => {
      const first = dosed(sql, minutesAgo(180), false, EMILY.email)
      const second = logDose(stampOf(sql), doseOf(vitaminDOf(sql).id, minutesAgo(30)))(sql)
      return { first, second, rows: doseRows(sql) }
    })
    expect(second).toEqual({
      ok: false,
      error: new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current: first }),
    })
    expect(rows).toBe(1)
  })

  it("logs the second dose when the parent confirms it, and answers the later of two with a third", async () => {
    const { second, third } = await inHousehold((sql) => {
      dosed(sql, minutesAgo(180))
      const second = dosed(sql, minutesAgo(60), true)
      return { second, third: logDose(stampOf(sql), doseOf(vitaminDOf(sql).id, minutesAgo(10)))(sql) }
    })
    expect(third).toEqual({
      ok: false,
      error: new DoseConflict({ code: "SUPPLEMENT_DUPLICATE_DAY", current: second }),
    })
  })

  it("logs one dose of each supplement on a date, a dose just after midnight, and one after a deleted dose, without asking", async () => {
    const results = await inHousehold((sql) => {
      const iron = saved(addSupplement(stampOf(sql), { actionId: ACTION_ID, name: "Iron", dose: "1 mL" })(sql))
      const deleted = dosed(sql, minutesAgo(300))
      saved(deleteDose(stampOf(sql), deleted.id, versioned(1))(sql))
      dosed(sql, SEP_30_AT_23_30)
      return [
        logDose(stampOf(sql), doseOf(vitaminDOf(sql).id, minutesAgo(60)))(sql).ok,
        logDose(stampOf(sql), doseOf(iron.id, minutesAgo(30)))(sql).ok,
        logDose(stampOf(sql), doseOf(vitaminDOf(sql).id, OCT_1_AT_00_30))(sql).ok,
      ]
    })
    expect(results).toEqual([true, true, true])
  })

  it("keeps each dose as its supplement's dose was then, when that dose changes later", async () => {
    const doses = await inHousehold((sql) => {
      const before = dosed(sql, SEP_30_AT_23_30)
      const vitaminD = vitaminDOf(sql)
      const edit = { actionId: ACTION_ID, version: 1, name: vitaminD.name, dose: "800 IU", stopped: false }
      saved(editSupplement(stampOf(sql), vitaminD.id, edit)(sql))
      return [before.dose, dosed(sql).dose]
    })
    expect(doses).toEqual(["400 IU", "800 IU"])
  })

  it("answers NotFound for a supplement the household doesn't hold", async () => {
    const result = await inHousehold((sql) => logDose(stampOf(sql), doseOf("no-such-supplement"))(sql))
    expect(result).toEqual({ ok: false, error: new NotFound() })
  })

  it("refuses a time more than 5 minutes ahead of the server's clock, and one before the birth date", async () => {
    const results = await inHousehold((sql) => {
      const vitaminD = vitaminDOf(sql).id
      return [
        logDose(stampOf(sql), doseOf(vitaminD, NOW + 6 * MINUTE_MS))(sql),
        logDose(stampOf(sql), doseOf(vitaminD, Date.UTC(2026, 7, 31, 12)))(sql),
      ]
    })
    expect(results).toEqual([
      { ok: false, error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "in_future" }] }) },
      { ok: false, error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "before_birth" }] }) },
    ])
  })
})

describe("editing a dose", () => {
  it("moves its time and its date, as the next version stamped with who edited it, and changes both days", async () => {
    const { logged, result, emily } = await inHousehold((sql) => {
      const logged = dosed(sql, OCT_1_AT_00_30)
      const edit = { actionId: ACTION_ID, version: 1, occurredAt: SEP_30_AT_23_30 }
      return {
        logged,
        result: editDose(stampOf(sql, EMILY.email, NOW + MINUTE_MS), logged.id, edit)(sql),
        emily: caregiverId(sql, EMILY.email),
      }
    })
    expect(result).toEqual({
      ok: true,
      response: {
        ...logged,
        occurredAt: SEP_30_AT_23_30,
        localDate: "2026-09-30",
        version: 2,
        updatedBy: emily,
        updatedAt: NOW + MINUTE_MS,
      },
      changed: [
        ["today"],
        ["last24h"],
        ["day", "2026-09-30"],
        ["day", "2026-10-01"],
        ["week", "2026-W40"],
        ["month", "2026-09"],
        ["month", "2026-10"],
      ],
    })
  })

  it("moves a dose onto a date that already has one without asking, since moving a dose gives no dose", async () => {
    const result = await inHousehold((sql) => {
      dosed(sql, minutesAgo(600))
      const moved = dosed(sql, SEP_30_AT_23_30)
      return editDose(stampOf(sql), moved.id, { actionId: ACTION_ID, version: 1, occurredAt: minutesAgo(30) })(sql)
    })
    expect(result.ok).toBe(true)
  })

  it("refuses to move it before the birth date, and answers STALE_VERSION from an older version", async () => {
    const results = await inHousehold((sql) => {
      const logged = dosed(sql)
      const early = { actionId: ACTION_ID, version: 1, occurredAt: Date.UTC(2026, 7, 31, 12) }
      return {
        early: editDose(stampOf(sql), logged.id, early)(sql),
        stale: editDose(stampOf(sql), logged.id, { ...early, version: 2, occurredAt: minutesAgo(5) })(sql),
        logged,
      }
    })
    expect(results.early).toEqual({
      ok: false,
      error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "before_birth" }] }),
    })
    expect(results.stale).toEqual({
      ok: false,
      error: new DoseConflict({ code: "STALE_VERSION", current: results.logged }),
    })
  })

  it("answers NotFound for a dose that was deleted, even from its current version", async () => {
    const result = await inHousehold((sql) => {
      const logged = dosed(sql)
      saved(deleteDose(stampOf(sql), logged.id, versioned(1))(sql))
      return editDose(stampOf(sql), logged.id, { actionId: ACTION_ID, version: 2, occurredAt: minutesAgo(5) })(sql)
    })
    expect(result).toEqual({ ok: false, error: new NotFound() })
  })
})

describe("deleting and restoring a dose", () => {
  it("deletes it softly, as the next version, and invalidates its days and the deleted list", async () => {
    const { logged, result } = await inHousehold((sql) => {
      const logged = dosed(sql)
      return { logged, result: deleteDose(stampOf(sql), logged.id, versioned(1))(sql) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...logged, version: 2, deletedAt: NOW },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("restores it as it was, even onto a date that has another dose since, without asking", async () => {
    const { logged, result } = await inHousehold((sql) => {
      const logged = dosed(sql, minutesAgo(120))
      saved(deleteDose(stampOf(sql), logged.id, versioned(1))(sql))
      dosed(sql, minutesAgo(60))
      return { logged, result: restoreDose(stampOf(sql), logged.id, versioned(2))(sql) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...logged, version: 3 },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("refuses to restore a dose from before the birth date with before_birth, and leaves it deleted (D10)", async () => {
    const { result, deletedAt } = await inHousehold((sql) => {
      const logged = dosed(sql, SEP_3_BEGINS)
      saved(deleteDose(stampOf(sql), logged.id, versioned(1))(sql))
      movedBirthDate(sql, "2026-09-04")
      return {
        result: restoreDose(stampOf(sql), logged.id, versioned(2))(sql),
        deletedAt: sql.exec<{ deleted_at: number }>("SELECT deleted_at FROM supplement_logs").one().deleted_at,
      }
    })
    expect(result).toEqual({
      ok: false,
      error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "before_birth" }] }),
    })
    expect(deletedAt).toBe(NOW)
  })

  it("answers NotFound when restoring a dose that isn't deleted", async () => {
    const result = await inHousehold((sql) => {
      const logged = dosed(sql)
      return restoreDose(stampOf(sql), logged.id, versioned(1))(sql)
    })
    expect(result).toEqual({ ok: false, error: new NotFound() })
  })
})

describe("a dose and the household's settings", () => {
  it("keeps the birth date from moving past a dose's date, but not past a deleted dose's", async () => {
    const results = await inHousehold((sql) => {
      const logged = dosed(sql, SEP_3_BEGINS)
      const later = { actionId: ACTION_ID, version: 1, ...SEED.child, birthDate: "2026-09-04" }
      const refused = editChild(stampOf(sql), later)(sql)
      saved(deleteDose(stampOf(sql), logged.id, versioned(1))(sql))
      return { refused, allowed: editChild(stampOf(sql), later)(sql).ok }
    })
    expect(results.refused).toEqual({
      ok: false,
      error: new InvalidInput({ fieldErrors: [{ path: "birthDate", issue: "before_birth" }] }),
    })
    expect(results.allowed).toBe(true)
  })

  it("files every dose, deleted ones included, under its date in a new time zone, in the zone change's own save (D8)", async () => {
    const dates = await inHousehold((sql) => {
      dosed(sql, SEP_30_AT_23_30)
      const deleted = dosed(sql, minutesAgo(60))
      saved(deleteDose(stampOf(sql), deleted.id, versioned(1))(sql))
      const units = { volume: "ml", weight: "kg", length: "cm" } as const
      saved(editHousehold(stampOf(sql), { actionId: ACTION_ID, version: 1, timeZone: "Asia/Tokyo", units })(sql))
      return sql
        .exec<{ local_date: string; version: number }>("SELECT local_date, version FROM supplement_logs ORDER BY rowid")
        .toArray()
    })
    expect(dates).toEqual([
      { local_date: "2026-10-01", version: 1 },
      { local_date: "2026-10-09", version: 2 },
    ])
  })
})

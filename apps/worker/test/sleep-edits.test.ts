import type { Sleep, SleepEdit } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { deleteSleep, editSleep, restoreSleep } from "../src/core/sleeps/edits.ts"
import { startSleep, wakeSleep } from "../src/core/sleeps/lifecycle.ts"
import { logSleep } from "../src/core/sleeps/log.ts"
import {
  ACTION_ID,
  caregiverId,
  CHANGED_TODAY,
  EMILY,
  HOUR_MS,
  inHousehold,
  MINUTE_MS,
  minutesAgo,
  movedBirthDate,
  NOW,
  saved,
  SEP_3_BEGINS,
  stampOf,
} from "./fixtures.ts"

const SEP_2_NOON = Date.UTC(2026, 8, 2, 19)
const CHANGED_SEP_2 = [["today"], ["last24h"], ["day", "2026-09-02"], ["week", "2026-W36"], ["month", "2026-09"]]

const version = (sleep: Sleep) => ({ actionId: ACTION_ID, version: sleep.version })

const editOf = (sleep: Sleep, change: Partial<SleepEdit> = {}): SleepEdit => ({
  actionId: ACTION_ID,
  version: sleep.version,
  kind: sleep.kind,
  startedAt: sleep.startedAt,
  endedAt: sleep.endedAt,
  ...change,
})

const logged = (sql: SqlStorage, startedAt = minutesAgo(90), endedAt = minutesAgo(30)) =>
  saved(logSleep(stampOf(sql), { actionId: ACTION_ID, kind: "nap", startedAt, endedAt })(sql))

const running = (sql: SqlStorage, startedAt = minutesAgo(30)) =>
  saved(startSleep(stampOf(sql), { actionId: ACTION_ID, kind: "nap", startedAt })(sql))

describe("editing a sleep", () => {
  it("saves new times and kind as the next version, stamped with who edited it, changing both days' keys", async () => {
    const { before, result, emily } = await inHousehold((sql) => {
      const before = logged(sql, SEP_2_NOON, SEP_2_NOON + HOUR_MS)
      const edit = editOf(before, { kind: "night", startedAt: minutesAgo(90), endedAt: minutesAgo(20) })
      return {
        before,
        result: editSleep(stampOf(sql, EMILY.email), before.id, edit)(sql),
        emily: caregiverId(sql, EMILY.email),
      }
    })
    expect(result).toEqual({
      ok: true,
      response: {
        ...before,
        kind: "night",
        startedAt: minutesAgo(90),
        endedAt: minutesAgo(20),
        version: 2,
        updatedBy: emily,
      },
      changed: [
        ["today"],
        ["last24h"],
        ["day", "2026-09-02"],
        ["day", "2026-10-08"],
        ["week", "2026-W36"],
        ["week", "2026-W41"],
        ["month", "2026-09"],
        ["month", "2026-10"],
      ],
    })
  })

  it("moves a running sleep's start, for a timer started late, keeping it running", async () => {
    const result = await inHousehold((sql) => {
      const sleep = running(sql)
      return editSleep(stampOf(sql), sleep.id, editOf(sleep, { startedAt: minutesAgo(45), kind: "night" }))(sql)
    })
    expect(result).toMatchObject({
      ok: true,
      response: { startedAt: minutesAgo(45), endedAt: null, kind: "night", version: 2 },
      changed: CHANGED_TODAY,
    })
  })

  it.each([
    ["ends a running sleep, which only a wake does", running, minutesAgo(1)],
    ["reopens a sleep that has ended", (sql: SqlStorage) => logged(sql), null],
  ])("refuses an edit that %s, naming endedAt", async (_label, existing, endedAt) => {
    const result = await inHousehold((sql) => {
      const sleep = existing(sql)
      return editSleep(stampOf(sql), sleep.id, editOf(sleep, { endedAt }))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "endedAt", issue: "invalid" }] } })
  })

  it.each([
    ["a new end before the start", { endedAt: minutesAgo(100) }, "endedAt", "end_not_after_start"],
    ["a sleep stretched past a day", { startedAt: NOW - 25 * HOUR_MS }, "endedAt", "out_of_range"],
  ])("refuses %s", async (_label, change, path, issue) => {
    const result = await inHousehold((sql) => {
      const sleep = logged(sql)
      return editSleep(stampOf(sql), sleep.id, editOf(sleep, change))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path, issue }] } })
  })

  it("refuses a running sleep's start moved more than 5 minutes ahead of the server's clock", async () => {
    const result = await inHousehold((sql) => {
      const sleep = running(sql)
      return editSleep(stampOf(sql), sleep.id, editOf(sleep, { startedAt: NOW + 6 * MINUTE_MS }))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "startedAt", issue: "in_future" }] } })
  })

  it("refuses an edit that runs into another sleep, with SLEEP_OVERLAP and that sleep, but not into its own old times", async () => {
    const { other, overlapping, ownTimes } = await inHousehold((sql) => {
      const other = logged(sql, minutesAgo(200), minutesAgo(150))
      const sleep = logged(sql, minutesAgo(90), minutesAgo(30))
      return {
        other,
        overlapping: editSleep(stampOf(sql), sleep.id, editOf(sleep, { startedAt: minutesAgo(160) }))(sql),
        ownTimes: editSleep(stampOf(sql), sleep.id, editOf(sleep, { startedAt: minutesAgo(80) }))(sql),
      }
    })
    expect(overlapping).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "SLEEP_OVERLAP", current: other }),
    })
    expect(ownTimes.ok).toBe(true)
  })

  it("answers STALE_VERSION with the sleep as it is now when the other phone changed it first", async () => {
    const { woken, result } = await inHousehold((sql) => {
      const sleep = running(sql)
      const woken = saved(wakeSleep(stampOf(sql, EMILY.email), sleep.id, { ...version(sleep), occurredAt: NOW })(sql))
      return { woken, result: editSleep(stampOf(sql), sleep.id, editOf(sleep, { kind: "night" }))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "STALE_VERSION", current: woken }) })
  })

  it("answers NotFound for a deleted sleep, even from its current version", async () => {
    const result = await inHousehold((sql) => {
      const deleted = saved(deleteSleep(stampOf(sql), logged(sql).id, { actionId: ACTION_ID, version: 1 })(sql))
      return editSleep(stampOf(sql), deleted.id, editOf(deleted, { kind: "night" }))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })

  it("changes only the kind of a sleep whose times now sit before a later birth date, since kept times skip the checks", async () => {
    const result = await inHousehold((sql) => {
      const sleep = logged(sql, SEP_2_NOON, SEP_2_NOON + HOUR_MS)
      movedBirthDate(sql, "2026-09-03")
      return editSleep(stampOf(sql), sleep.id, editOf(sleep, { kind: "night" }))(sql)
    })
    expect(result).toMatchObject({
      ok: true,
      response: { kind: "night", startedAt: SEP_2_NOON },
      changed: CHANGED_SEP_2,
    })
  })

  it("relabels a sleep woken after more than a day, since its kept times skip the checks", async () => {
    const result = await inHousehold((sql) => {
      const sleep = running(sql, NOW - 30 * HOUR_MS)
      const woken = saved(wakeSleep(stampOf(sql), sleep.id, { ...version(sleep), occurredAt: NOW })(sql))
      return editSleep(stampOf(sql), woken.id, editOf(woken, { kind: "night" }))(sql)
    })
    expect(result).toMatchObject({ ok: true, response: { kind: "night", startedAt: NOW - 30 * HOUR_MS } })
  })

  it("checks a moved start against her birth date, though not a kept one", async () => {
    const result = await inHousehold((sql) => {
      const sleep = logged(sql, SEP_3_BEGINS + HOUR_MS, SEP_3_BEGINS + 2 * HOUR_MS)
      movedBirthDate(sql, "2026-09-03")
      return editSleep(stampOf(sql), sleep.id, editOf(sleep, { startedAt: SEP_2_NOON }))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "startedAt", issue: "before_birth" }] } })
  })
})

describe("deleting a sleep", () => {
  it("marks it deleted as it stands, as the next version, changing its days and Recently deleted", async () => {
    const { sleep, result } = await inHousehold((sql) => {
      const sleep = logged(sql)
      return { sleep, result: deleteSleep(stampOf(sql), sleep.id, version(sleep))(sql) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...sleep, version: 2, deletedAt: NOW },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("deletes a running sleep, so another can start", async () => {
    const result = await inHousehold((sql) => {
      const sleep = running(sql)
      saved(deleteSleep(stampOf(sql), sleep.id, version(sleep))(sql))
      return startSleep(stampOf(sql), { actionId: ACTION_ID, kind: "nap", startedAt: NOW })(sql)
    })
    expect(result.ok).toBe(true)
  })

  it("answers STALE_VERSION with the sleep as it is now when the other phone changed it first", async () => {
    const { edited, result } = await inHousehold((sql) => {
      const sleep = logged(sql)
      const edited = saved(editSleep(stampOf(sql, EMILY.email), sleep.id, editOf(sleep, { kind: "night" }))(sql))
      return { edited, result: deleteSleep(stampOf(sql), sleep.id, version(sleep))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "STALE_VERSION", current: edited }) })
  })

  it("answers NotFound for a sleep that's already deleted", async () => {
    const result = await inHousehold((sql) => {
      const deleted = saved(deleteSleep(stampOf(sql), logged(sql).id, { actionId: ACTION_ID, version: 1 })(sql))
      return deleteSleep(stampOf(sql), deleted.id, version(deleted))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

describe("restoring a sleep (D10)", () => {
  it("brings it back as it was, as the next version, changing its days and Recently deleted", async () => {
    const { deleted, result } = await inHousehold((sql) => {
      const deleted = saved(deleteSleep(stampOf(sql), logged(sql).id, { actionId: ACTION_ID, version: 1 })(sql))
      return { deleted, result: restoreSleep(stampOf(sql), deleted.id, version(deleted))(sql) }
    })
    expect(result).toEqual({
      ok: true,
      response: { ...deleted, version: 3, deletedAt: null },
      changed: [...CHANGED_TODAY, ["deleted"]],
    })
  })

  it("brings a sleep deleted while running back running, from its start", async () => {
    const result = await inHousehold((sql) => {
      const deleted = saved(deleteSleep(stampOf(sql), running(sql).id, { actionId: ACTION_ID, version: 1 })(sql))
      return restoreSleep(stampOf(sql), deleted.id, version(deleted))(sql)
    })
    expect(result).toMatchObject({ ok: true, response: { startedAt: minutesAgo(30), endedAt: null, deletedAt: null } })
  })

  it("refuses a running sleep while another runs, with SLEEP_ALREADY_ACTIVE and that sleep", async () => {
    const { other, result } = await inHousehold((sql) => {
      const deleted = saved(deleteSleep(stampOf(sql), running(sql).id, { actionId: ACTION_ID, version: 1 })(sql))
      const other = running(sql, minutesAgo(5))
      return { other, result: restoreSleep(stampOf(sql), deleted.id, version(deleted))(sql) }
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "SLEEP_ALREADY_ACTIVE", current: other }),
    })
  })

  it("refuses a sleep a live one now overlaps, with SLEEP_OVERLAP and that sleep", async () => {
    const { other, result } = await inHousehold((sql) => {
      const deleted = saved(deleteSleep(stampOf(sql), logged(sql).id, { actionId: ACTION_ID, version: 1 })(sql))
      const other = logged(sql, minutesAgo(60), minutesAgo(10))
      return { other, result: restoreSleep(stampOf(sql), deleted.id, version(deleted))(sql) }
    })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "SLEEP_OVERLAP", current: other }) })
  })

  it("refuses a sleep that now sits before her birth date, naming startedAt", async () => {
    const result = await inHousehold((sql) => {
      const sleep = logged(sql, SEP_2_NOON, SEP_2_NOON + HOUR_MS)
      const deleted = saved(deleteSleep(stampOf(sql), sleep.id, version(sleep))(sql))
      movedBirthDate(sql, "2026-09-03")
      return restoreSleep(stampOf(sql), deleted.id, version(deleted))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { fieldErrors: [{ path: "startedAt", issue: "before_birth" }] } })
  })

  it("answers NotFound for a sleep that isn't deleted", async () => {
    const result = await inHousehold((sql) => {
      const sleep = logged(sql)
      return restoreSleep(stampOf(sql), sleep.id, version(sleep))(sql)
    })
    expect(result).toMatchObject({ ok: false, error: { _tag: "NotFound" } })
  })
})

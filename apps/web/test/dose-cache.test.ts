import { type DayPeriod, type Me, queryKeys, type Today } from "@bt/contracts"
import { zonedDayBounds } from "@bt/domain"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { cachedEntry } from "../src/api/entry-cache.ts"
import { pendIn, rollBack, settle } from "../src/api/optimistic.ts"
import { pendingId } from "../src/api/pending.ts"
import { pendingToday, savedToday, withdrawnToday } from "../src/api/today-cache.ts"
import { meWith } from "./growth-fixtures.ts"
import { dayWith, local, NOW_ON_DAY } from "./history-fixtures.ts"
import {
  ANDREW,
  diaperAt,
  dosedAt,
  MINUTE,
  NO_TOTALS,
  supplementOf,
  todayWith,
  VITAMIN_D,
  ZONE,
} from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const VITAMIN_D_SUPPLEMENT = supplementOf()
const PENDING = { by: ANDREW, now: NOW_ON_DAY, zone: ZONE, supplements: [VITAMIN_D_SUPPLEMENT] }
const YESTERDAY_AT_23_30 = local("23:30", "2026-10-08")

const logAt = (occurredAt: number): Action => ({
  kind: "logDose",
  payload: { actionId: ACTION_ID, supplementId: VITAMIN_D, occurredAt, confirmedDuplicate: false },
})

const pendingDoseAt = (occurredAt: number, localDate: string) => ({
  id: pendingId(ACTION_ID),
  supplementId: VITAMIN_D,
  occurredAt,
  localDate,
  dose: "400 IU",
  version: 1,
  createdBy: ANDREW,
  createdAt: NOW_ON_DAY,
  updatedBy: ANDREW,
  updatedAt: NOW_ON_DAY,
  deletedAt: null,
})

describe("a dose being logged", () => {
  it("lists it first in the last 24 hours and in today's doses, at its supplement's dose, counting nothing", () => {
    const earlier = diaperAt(NOW_ON_DAY - 60 * MINUTE)
    const today = todayWith({ recent: [{ kind: "diaper", diaper: earlier }] })
    const next = pendingToday(today, logAt(NOW_ON_DAY - 5 * MINUTE), PENDING)
    const dose = pendingDoseAt(NOW_ON_DAY - 5 * MINUTE, "2026-10-09")
    expect(next).toEqual({
      ...today,
      recent: [
        { kind: "dose", dose },
        { kind: "diaper", diaper: earlier },
      ],
      doses: [dose],
    })
    expect(next.totals).toEqual(NO_TOTALS)
  })

  it("leaves today's doses alone for a dose backdated to yesterday, though it's in the last 24 hours", () => {
    const next = pendingToday(todayWith(), logAt(YESTERDAY_AT_23_30), PENDING)
    expect(next.recent).toEqual([{ kind: "dose", dose: pendingDoseAt(YESTERDAY_AT_23_30, "2026-10-08") }])
    expect(next.doses).toEqual([])
  })

  it("takes the dose back off both lists when its save fails, leaving the rest", () => {
    const kept = dosedAt(local("07:00"))
    const before = todayWith({ recent: [{ kind: "dose", dose: kept }], doses: [kept] })
    const shown = pendingToday(before, logAt(NOW_ON_DAY), PENDING)
    expect(withdrawnToday(shown, logAt(NOW_ON_DAY), PENDING, before)).toEqual(before)
  })

  it("swaps the pending dose for the household's answer in both lists", () => {
    const shown = pendingToday(todayWith(), logAt(NOW_ON_DAY), PENDING)
    const saved = dosedAt(NOW_ON_DAY, { id: "dose-saved", createdBy: ANDREW, updatedBy: ANDREW })
    const next = savedToday(shown, { dose: saved, changed: [] }, logAt(NOW_ON_DAY), NOW_ON_DAY)
    expect(next.recent).toEqual([{ kind: "dose", dose: saved }])
    expect(next.doses).toEqual([saved])
  })

  it("shows a restored dose in today's doses once the household answers, in time order", () => {
    const later = dosedAt(local("08:00"))
    const restored = dosedAt(local("07:00"), { id: "dose-restored", version: 3 })
    const action: Action = { kind: "restoreDose", id: restored.id, payload: { actionId: ACTION_ID, version: 2 } }
    const today = todayWith({ recent: [{ kind: "dose", dose: later }], doses: [later] })
    const next = savedToday(today, { dose: restored, changed: [] }, action, NOW_ON_DAY)
    expect(next.doses).toEqual([restored, later])
    expect(next.recent).toEqual([
      { kind: "dose", dose: later },
      { kind: "dose", dose: restored },
    ])
  })
})

describe("an edit or delete of a dose", () => {
  const DOSE = dosedAt(local("07:00"), { id: "dose-1" })
  const ME: Me = { ...meWith(), household: { ...meWith().household, supplements: [VITAMIN_D_SUPPLEMENT] } }

  const householdCache = () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, ME)
    queryClient.setQueryData(queryKeys.today, todayWith({ recent: [{ kind: "dose", dose: DOSE }], doses: [DOSE] }))
    queryClient.setQueryData(queryKeys.day("2026-10-09"), dayWith({ feeds: [], diapers: [], doses: [DOSE] }))
    queryClient.setQueryData(
      queryKeys.day("2026-10-08"),
      dayWith({ date: "2026-10-08", bounds: zonedDayBounds("2026-10-08", ZONE), feeds: [], diapers: [] }),
    )
    return queryClient
  }

  const MOVE_TO_YESTERDAY: Action = {
    kind: "editDose",
    id: DOSE.id,
    payload: { actionId: ACTION_ID, version: 1, occurredAt: YESTERDAY_AT_23_30 },
  }

  it("moves a dose to its new date on Today and both cached days at once, and puts them back when it fails", async () => {
    const queryClient = householdCache()
    const before = {
      today: queryClient.getQueryData<Today>(queryKeys.today),
      day: queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09")),
      yesterday: queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-08")),
    }
    const pended = await pendIn(queryClient, MOVE_TO_YESTERDAY, NOW_ON_DAY)
    const moved = {
      ...DOSE,
      occurredAt: YESTERDAY_AT_23_30,
      localDate: "2026-10-08",
      updatedBy: ANDREW,
      updatedAt: NOW_ON_DAY,
    }
    expect(queryClient.getQueryData<Today>(queryKeys.today)).toMatchObject({
      recent: [{ kind: "dose", dose: moved }],
      doses: [],
    })
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))?.doses).toEqual([])
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-08"))?.doses).toEqual([moved])
    rollBack(queryClient, MOVE_TO_YESTERDAY, pended)
    expect(queryClient.getQueryData(queryKeys.today)).toEqual(before.today)
    expect(queryClient.getQueryData(queryKeys.day("2026-10-09"))).toEqual(before.day)
    expect(queryClient.getQueryData(queryKeys.day("2026-10-08"))).toEqual(before.yesterday)
  })

  it("takes a deleted dose off Today and its day at once, and keeps it off once the household answers", async () => {
    const queryClient = householdCache()
    const action: Action = { kind: "deleteDose", id: DOSE.id, payload: { actionId: ACTION_ID, version: 1 } }
    await pendIn(queryClient, action, NOW_ON_DAY)
    expect(queryClient.getQueryData<Today>(queryKeys.today)).toMatchObject({ recent: [], doses: [] })
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))?.doses).toEqual([])
    settle(queryClient, { dose: { ...DOSE, version: 2, deletedAt: NOW_ON_DAY }, changed: [] }, action, NOW_ON_DAY)
    expect(queryClient.getQueryData<Today>(queryKeys.today)).toMatchObject({ recent: [], doses: [] })
  })

  it("opens an edit sheet on the newest copy of a dose, from Today's doses or a cached day", () => {
    const queryClient = householdCache()
    const newer = { ...DOSE, version: 2, occurredAt: local("07:10") }
    queryClient.setQueryData(queryKeys.day("2026-10-09"), dayWith({ feeds: [], diapers: [], doses: [newer] }))
    expect(cachedEntry(queryClient, DOSE.id)).toEqual({ kind: "dose", dose: newer })
  })
})

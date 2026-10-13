import { type DayPeriod, queryKeys, type RecentEntry, type Today } from "@bt/contracts"
import { totalsIn } from "@bt/domain"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { cachedEntry } from "../src/api/entry-cache.ts"
import { pendIn, rollBack, settle } from "../src/api/optimistic.ts"
import { pendingId } from "../src/api/pending.ts"
import { type Swap, swappedDay, swappedEntry, swappedToday } from "../src/api/swap.ts"
import { timeOf } from "../src/api/today-change.ts"
import { meWith } from "./growth-fixtures.ts"
import { BOTTLE, BOUNDS, dayWith, local, NOW_ON_DAY, NURSED, PEE, POO, RUNNING } from "./history-fixtures.ts"
import { ANDREW, MINUTE, sleptAt, todayWith, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const PENDING = { by: ANDREW, now: NOW_ON_DAY, zone: ZONE }
const YESTERDAY = "2026-10-08"
const COUNTED_AT = RUNNING.startedAt + 5_000
const DELETED_AT = COUNTED_AT + 20 * MINUTE
const DELETE_RUNNING = {
  kind: "deleteFeed",
  id: RUNNING.id,
  payload: { actionId: ACTION_ID, version: 1 },
} satisfies Action

const diaper = (entry: typeof PEE): RecentEntry => ({ kind: "diaper", diaper: entry })
const feed = (entry: typeof NURSED): RecentEntry => ({ kind: "feed", feed: entry })

const EDIT_PEE_TO_BOTH: Action = {
  kind: "editDiaper",
  id: PEE.id,
  payload: { actionId: ACTION_ID, version: 1, occurredAt: PEE.occurredAt, wet: true, dirty: true },
}

const REDONE_NURSED = {
  actionId: ACTION_ID,
  version: 1,
  segments: [
    { side: "left" as const, startedAt: local("01:05"), endedAt: local("01:15") },
    { side: "right" as const, startedAt: local("01:15"), endedAt: local("01:28") },
  ],
  portions: [{ occurredAt: local("01:30"), breastMilkMl: 30, formulaMl: 0 }],
}

const countedDay = (records: Pick<DayPeriod, "feeds" | "diapers">) =>
  dayWith({ ...records, measurements: [], totals: totalsIn(BOUNDS, { ...records, sleeps: [] }, NOW_ON_DAY) })

const recentOf = (entries: ReadonlyArray<RecentEntry>) => entries.toSorted((a, b) => timeOf(b) - timeOf(a))

const countedToday = (entries: ReadonlyArray<RecentEntry>) => {
  const feeds = entries.flatMap((entry) => (entry.kind === "feed" ? [entry.feed] : []))
  const diapers = entries.flatMap((entry) => (entry.kind === "diaper" ? [entry.diaper] : []))
  const lastFeed = feeds.toSorted((a, b) => b.startedAt - a.startedAt)[0] ?? null
  return todayWith({
    totals: totalsIn(BOUNDS, { feeds, diapers, sleeps: [] }, NOW_ON_DAY),
    lastFeed,
    recent: recentOf(entries),
  })
}

describe("an edit or delete swapped in before the household answers", () => {
  it("rebuilds an edited feed from the sides and bottles sent, under ids that say it's saving, with its new bounds", () => {
    const edited = swappedEntry(feed(NURSED), { kind: "editFeed", id: NURSED.id, payload: REDONE_NURSED }, PENDING)
    expect(edited).toEqual({
      kind: "feed",
      feed: {
        ...NURSED,
        startedAt: local("01:05"),
        endedAt: local("01:30"),
        segments: [
          { id: `${pendingId(ACTION_ID)}:segment:0`, ...REDONE_NURSED.segments[0] },
          { id: `${pendingId(ACTION_ID)}:segment:1`, ...REDONE_NURSED.segments[1] },
        ],
        portions: [{ id: `${pendingId(ACTION_ID)}:portion:0`, ...REDONE_NURSED.portions[0] }],
        updatedBy: ANDREW,
        updatedAt: NOW_ON_DAY,
      },
    })
  })

  it("keeps a day's totals equal to its records' after each edit, delete or move away", () => {
    const day = countedDay({ feeds: [NURSED, BOTTLE], diapers: [PEE, POO] })
    const both = { ...PEE, dirty: true }
    const movedAway = {
      ...NURSED,
      startedAt: local("23:05", YESTERDAY),
      endedAt: local("23:28", YESTERDAY),
      segments: [],
    }
    const swaps: ReadonlyArray<Swap> = [
      { before: diaper(PEE), after: diaper(both) },
      { before: feed(BOTTLE), after: null },
      { before: feed(NURSED), after: feed(movedAway) },
    ]
    const swapped = swaps.reduce((current, swap) => swappedDay(current, NOW_ON_DAY, swap), day)
    expect(swapped).toEqual(countedDay({ feeds: [], diapers: [both, POO] }))
  })

  it("keeps the day's sleeps, and their numbers in its totals, through an edit to another entry", () => {
    const nap = {
      id: "nap-1",
      kind: "nap" as const,
      startedAt: local("03:00"),
      endedAt: local("04:30"),
      version: 1,
      createdBy: ANDREW,
      createdAt: local("04:30"),
      updatedBy: ANDREW,
      updatedAt: local("04:30"),
      deletedAt: null,
    }
    const entries = { feeds: [], diapers: [PEE], sleeps: [nap] }
    const day = dayWith({ ...entries, measurements: [], totals: totalsIn(BOUNDS, entries, NOW_ON_DAY) })
    const swapped = swappedDay(day, NOW_ON_DAY, { before: diaper(PEE), after: diaper({ ...PEE, dirty: true }) })
    expect(swapped.sleeps).toEqual([nap])
    expect(swapped.totals).toMatchObject({
      dirtyDiapers: 1,
      sleepsStarted: 1,
      sleepSeconds: 5400,
      napSeconds: 5400,
      longestSleepSeconds: 5400,
    })
  })

  it("keeps every sleep number in Today's totals as it was through an edit to a diaper and a delete of a feed", () => {
    const asleep = {
      sleepsStarted: 2,
      sleepSeconds: 7200,
      napSeconds: 5400,
      nightSeconds: 1800,
      longestSleepSeconds: 5400,
    }
    const counted = countedToday([feed(NURSED), diaper(PEE)])
    const today = { ...counted, totals: { ...counted.totals, ...asleep } }
    const both = { ...PEE, dirty: true }
    const edited = swappedToday(today, PENDING, { before: diaper(PEE), after: diaper(both) }, NOW_ON_DAY)
    const deleted = swappedToday(today, PENDING, { before: feed(NURSED), after: null }, NOW_ON_DAY)
    expect(edited.totals).toEqual({ ...countedToday([feed(NURSED), diaper(both)]).totals, ...asleep })
    expect(deleted.totals).toEqual({ ...countedToday([diaper(PEE)]).totals, ...asleep })
  })

  it("adds a feed moved onto the day in its place, oldest first", () => {
    const day = countedDay({ feeds: [NURSED, BOTTLE], diapers: [] })
    const arriving = { ...NURSED, id: "arriving", startedAt: local("02:00"), endedAt: local("02:00") }
    const swapped = swappedDay(day, NOW_ON_DAY, { before: null, after: feed(arriving) })
    expect(swapped.feeds.map(({ id }) => id)).toEqual([NURSED.id, "arriving", BOTTLE.id])
  })

  it("moves Today's totals, list and last feed with the edit, dropping an entry moved out of the last 24 hours", () => {
    const today = countedToday([feed(NURSED), feed(BOTTLE), diaper(PEE)])
    const at = NOW_ON_DAY - 25 * 60 * MINUTE
    const yesterday = {
      ...BOTTLE,
      startedAt: at,
      endedAt: at,
      portions: BOTTLE.portions.map((portion) => ({ ...portion, occurredAt: at })),
    }
    const edited = swappedToday(today, PENDING, { before: feed(BOTTLE), after: feed(yesterday) }, NOW_ON_DAY)
    expect(edited).toEqual({ ...countedToday([feed(NURSED), diaper(PEE)]), lastFeed: NURSED })
  })

  it("lets the last feed fall back to the latest one left when it's deleted", () => {
    const today = countedToday([feed(NURSED), feed(BOTTLE)])
    expect(swappedToday(today, PENDING, { before: feed(BOTTLE), after: null }, NOW_ON_DAY).lastFeed).toEqual(NURSED)
  })
})

describe("the caches an edit or delete changes at once", () => {
  const householdCache = () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, meWith())
    queryClient.setQueryData(queryKeys.today, countedToday([feed(NURSED), diaper(PEE)]))
    queryClient.setQueryData(queryKeys.day("2026-10-09"), countedDay({ feeds: [NURSED], diapers: [PEE] }))
    return queryClient
  }

  it("shows the edit on Today and the cached day at once, and puts both back exactly when it fails", async () => {
    const queryClient = householdCache()
    const today = queryClient.getQueryData<Today>(queryKeys.today)
    const day = queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))
    const pended = await pendIn(queryClient, EDIT_PEE_TO_BOTH, NOW_ON_DAY)
    const both = { ...PEE, dirty: true, updatedAt: NOW_ON_DAY, updatedBy: ANDREW }
    expect(queryClient.getQueryData(queryKeys.today)).toEqual(countedToday([feed(NURSED), diaper(both)]))
    expect(queryClient.getQueryData(queryKeys.day("2026-10-09"))).toEqual(
      countedDay({ feeds: [NURSED], diapers: [both] }),
    )
    rollBack(queryClient, EDIT_PEE_TO_BOTH, pended)
    expect(queryClient.getQueryData(queryKeys.today)).toEqual(today)
    expect(queryClient.getQueryData(queryKeys.day("2026-10-09"))).toEqual(day)
  })

  it("takes a deleted entry off Today and its day at once", async () => {
    const queryClient = householdCache()
    await pendIn(
      queryClient,
      { kind: "deleteFeed", id: NURSED.id, payload: { actionId: ACTION_ID, version: 1 } },
      NOW_ON_DAY,
    )
    expect(queryClient.getQueryData<Today>(queryKeys.today)?.recent).toEqual([diaper(PEE)])
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))?.feeds).toEqual([])
  })

  it("leaves Today's list alone when the household answers an edit to an entry it doesn't show", () => {
    const queryClient = householdCache()
    const old = { ...POO, id: "old-diaper", occurredAt: NOW_ON_DAY - 30 * 60 * MINUTE }
    const action: Action = {
      kind: "editDiaper",
      id: old.id,
      payload: { actionId: ACTION_ID, version: 1, occurredAt: old.occurredAt, wet: true, dirty: true },
    }
    settle(queryClient, { diaper: { ...old, wet: true, version: 2 }, changed: [] }, action, NOW_ON_DAY)
    expect(queryClient.getQueryData<Today>(queryKeys.today)?.recent).toEqual([diaper(PEE), feed(NURSED)])
  })

  it("leaves Today's list alone when the household answers the Undo of a delete to an entry older than 24 hours", () => {
    const queryClient = householdCache()
    const old = { ...POO, id: "old-diaper", occurredAt: NOW_ON_DAY - 30 * 60 * MINUTE, version: 3 }
    const undo: Action = { kind: "restoreDiaper", id: old.id, payload: { actionId: ACTION_ID, version: 2 } }
    settle(queryClient, { diaper: old, changed: [] }, undo, NOW_ON_DAY)
    expect(queryClient.getQueryData<Today>(queryKeys.today)?.recent).toEqual([diaper(PEE), feed(NURSED)])
  })

  it("takes a running feed off Today as Today counted it, never below zero, and puts Today back exactly when the delete fails", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, meWith())
    const counted = todayWith({
      totals: totalsIn(BOUNDS, { feeds: [NURSED, RUNNING], diapers: [], sleeps: [] }, COUNTED_AT),
      activeFeed: RUNNING,
      lastFeed: RUNNING,
      recent: [feed(RUNNING), feed(NURSED)],
    })
    queryClient.setQueryData(queryKeys.today, counted, { updatedAt: COUNTED_AT })
    const pended = await pendIn(queryClient, DELETE_RUNNING, DELETED_AT)
    expect(queryClient.getQueryData(queryKeys.today)).toEqual(
      todayWith({
        totals: totalsIn(BOUNDS, { feeds: [NURSED], diapers: [], sleeps: [] }, COUNTED_AT),
        lastFeed: NURSED,
        recent: [feed(NURSED)],
      }),
    )
    rollBack(queryClient, DELETE_RUNNING, pended)
    expect(queryClient.getQueryData(queryKeys.today)).toEqual(counted)
  })

  it("works a cached day's totals out from its records when a running feed is deleted, never below zero, and puts its feeds back when the delete fails", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, meWith())
    const counted = dayWith({
      feeds: [NURSED, RUNNING],
      diapers: [],
      totals: totalsIn(BOUNDS, { feeds: [NURSED, RUNNING], diapers: [], sleeps: [] }, COUNTED_AT),
    })
    queryClient.setQueryData(queryKeys.day("2026-10-09"), counted)
    const pended = await pendIn(queryClient, DELETE_RUNNING, DELETED_AT)
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))?.totals).toEqual(
      totalsIn(BOUNDS, { feeds: [NURSED], diapers: [], sleeps: [] }, DELETED_AT),
    )
    rollBack(queryClient, DELETE_RUNNING, pended)
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))?.feeds).toEqual([NURSED, RUNNING])
  })
})

describe("the copy of an entry an edit sheet opens on", () => {
  const NEWER_PEE = { ...PEE, dirty: true, version: 2 }
  const NEWER_NURSED = { ...NURSED, endedAt: local("01:30"), version: 2 }

  const cachedWith = (todayEntries: ReadonlyArray<RecentEntry>, day: Pick<DayPeriod, "feeds" | "diapers">) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, meWith())
    queryClient.setQueryData(queryKeys.today, countedToday(todayEntries))
    queryClient.setQueryData(queryKeys.day("2026-10-09"), countedDay(day))
    return queryClient
  }

  it("is the newer version of a diaper or a feed a cached day holds when Today still holds an older one", () => {
    const queryClient = cachedWith([diaper(PEE), feed(NURSED)], { feeds: [NEWER_NURSED], diapers: [NEWER_PEE] })
    expect(cachedEntry(queryClient, PEE.id)).toEqual(diaper(NEWER_PEE))
    expect(cachedEntry(queryClient, NURSED.id)).toEqual(feed(NEWER_NURSED))
  })

  it("is the newest of the days a feed crossing midnight is cached on", () => {
    const queryClient = cachedWith([], { feeds: [NURSED], diapers: [] })
    queryClient.setQueryData(queryKeys.day(YESTERDAY), countedDay({ feeds: [NEWER_NURSED], diapers: [] }))
    expect(cachedEntry(queryClient, NURSED.id)).toEqual(feed(NEWER_NURSED))
  })

  it("is Today's copy when a cached day holds the same version", () => {
    const queryClient = cachedWith([diaper(PEE), feed(NURSED)], {
      feeds: [{ ...NURSED, endedAt: local("01:30") }],
      diapers: [{ ...PEE, dirty: true }],
    })
    expect(cachedEntry(queryClient, PEE.id)).toEqual(diaper(PEE))
    expect(cachedEntry(queryClient, NURSED.id)).toEqual(feed(NURSED))
  })

  it("is the only copy there is, from a cached day when Today holds none", () => {
    const queryClient = cachedWith([], { feeds: [], diapers: [POO] })
    expect(cachedEntry(queryClient, POO.id)).toEqual(diaper(POO))
    expect(cachedEntry(queryClient, PEE.id)).toBeNull()
  })

  it("finds a sleep: the one running on Today, or the newest copy a cached day holds", () => {
    const running = sleptAt(local("08:48"), { endedAt: null })
    const nap = sleptAt(local("01:10"), { endedAt: local("02:30") })
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, meWith())
    queryClient.setQueryData(queryKeys.today, todayWith({ activeSleep: running, lastSleep: running }))
    queryClient.setQueryData(queryKeys.day("2026-10-09"), dayWith({ sleeps: [{ ...nap, version: 2 }] }))
    expect(cachedEntry(queryClient, running.id)).toEqual({ kind: "sleep", sleep: running })
    expect(cachedEntry(queryClient, nap.id)).toEqual({ kind: "sleep", sleep: { ...nap, version: 2 } })
  })

  it("puts the newest copy back in the fresh day when an edit made over a stale Today fails", async () => {
    const queryClient = cachedWith([diaper(PEE)], { feeds: [], diapers: [NEWER_PEE] })
    const fresh = queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))
    const pended = await pendIn(queryClient, EDIT_PEE_TO_BOTH, NOW_ON_DAY)
    rollBack(queryClient, EDIT_PEE_TO_BOTH, pended)
    expect(queryClient.getQueryData(queryKeys.day("2026-10-09"))).toEqual(fresh)
    expect(queryClient.getQueryData<Today>(queryKeys.today)?.recent).toEqual([diaper(NEWER_PEE)])
  })
})

describe("a sleep edited or deleted before the household answers", () => {
  const RUNNING_SLEEP = sleptAt(local("08:48"), { endedAt: null })
  const NAP = sleptAt(local("01:10"), { endedAt: local("02:30") })
  const DAY = "2026-10-09"

  const cached = () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, meWith())
    const recent = [
      { kind: "sleep" as const, sleep: RUNNING_SLEEP },
      { kind: "sleep" as const, sleep: NAP },
    ]
    queryClient.setQueryData(
      queryKeys.today,
      todayWith({ activeSleep: RUNNING_SLEEP, lastSleep: RUNNING_SLEEP, recent }),
    )
    const sleeps = [NAP, RUNNING_SLEEP]
    const totals = totalsIn(BOUNDS, { feeds: [], diapers: [], sleeps }, NOW_ON_DAY)
    queryClient.setQueryData(queryKeys.day(DAY), dayWith({ feeds: [], diapers: [], sleeps, totals }))
    return queryClient
  }

  it("moves an edited sleep at once on Today and the cached day, with its label, and counts the day again", async () => {
    const queryClient = cached()
    const before = queryClient.getQueryData<DayPeriod>(queryKeys.day(DAY))
    const edit: Action = {
      kind: "editSleep",
      id: NAP.id,
      payload: { actionId: ACTION_ID, version: 1, kind: "night", startedAt: local("01:00"), endedAt: local("02:30") },
    }
    const pended = await pendIn(queryClient, edit, NOW_ON_DAY)
    const edited = {
      ...NAP,
      kind: "night" as const,
      startedAt: local("01:00"),
      updatedBy: ANDREW,
      updatedAt: NOW_ON_DAY,
    }
    expect(queryClient.getQueryData<Today>(queryKeys.today)?.recent).toContainEqual({ kind: "sleep", sleep: edited })
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day(DAY))).toMatchObject({
      sleeps: [edited, RUNNING_SLEEP],
      totals: totalsIn(BOUNDS, { feeds: [], diapers: [], sleeps: [edited, RUNNING_SLEEP] }, NOW_ON_DAY),
    })
    rollBack(queryClient, edit, pended)
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day(DAY))?.sleeps).toEqual(before?.sleeps)
  })

  it("keeps a running sleep running through an edit of its start", async () => {
    const queryClient = cached()
    const edit: Action = {
      kind: "editSleep",
      id: RUNNING_SLEEP.id,
      payload: { actionId: ACTION_ID, version: 1, kind: "nap", startedAt: local("08:30"), endedAt: null },
    }
    await pendIn(queryClient, edit, NOW_ON_DAY)
    const today = queryClient.getQueryData<Today>(queryKeys.today)
    expect([today?.activeSleep?.startedAt, today?.lastSleep?.startedAt]).toEqual([local("08:30"), local("08:30")])
  })

  it("takes a deleted running sleep off Today and the cached day at once, the nap before it the last sleep again", async () => {
    const queryClient = cached()
    const remove: Action = {
      kind: "deleteSleep",
      id: RUNNING_SLEEP.id,
      payload: { actionId: ACTION_ID, version: 1 },
    }
    await pendIn(queryClient, remove, NOW_ON_DAY)
    const today = queryClient.getQueryData<Today>(queryKeys.today)
    expect([today?.activeSleep, today?.lastSleep]).toEqual([null, NAP])
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day(DAY))?.sleeps).toEqual([NAP])
  })
})

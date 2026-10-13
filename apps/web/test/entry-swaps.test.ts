import { type DayPeriod, queryKeys, type RecentEntry, type Today } from "@bt/contracts"
import { totalsIn } from "@bt/domain"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { pendIn, rollBack, settle } from "../src/api/optimistic.ts"
import { pendingId } from "../src/api/pending.ts"
import { type Swap, swappedDay, swappedEntry, swappedToday } from "../src/api/swap.ts"
import { meWith } from "./growth-fixtures.ts"
import { BOTTLE, BOUNDS, dayWith, local, NOW_ON_DAY, NURSED, PEE, POO, RUNNING } from "./history-fixtures.ts"
import { ANDREW, MINUTE, todayWith, ZONE } from "./today-fixtures.ts"

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
  dayWith({ ...records, measurements: [], totals: totalsIn(BOUNDS, records.feeds, records.diapers, NOW_ON_DAY) })

const recentOf = (entries: ReadonlyArray<RecentEntry>) => entries.toSorted((a, b) => timeOf(b) - timeOf(a))

const timeOf = (entry: RecentEntry) => (entry.kind === "feed" ? entry.feed.startedAt : entry.diaper.occurredAt)

const countedToday = (entries: ReadonlyArray<RecentEntry>) => {
  const feeds = entries.flatMap((entry) => (entry.kind === "feed" ? [entry.feed] : []))
  const diapers = entries.flatMap((entry) => (entry.kind === "diaper" ? [entry.diaper] : []))
  const lastFeed = feeds.toSorted((a, b) => b.startedAt - a.startedAt)[0] ?? null
  return todayWith({ totals: totalsIn(BOUNDS, feeds, diapers, NOW_ON_DAY), lastFeed, recent: recentOf(entries) })
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
    settle(queryClient, { diaper: { ...old, wet: true, version: 2 }, changed: [] }, action)
    expect(queryClient.getQueryData<Today>(queryKeys.today)?.recent).toEqual([diaper(PEE), feed(NURSED)])
  })

  it("takes a running feed off Today as Today counted it, never below zero, and puts Today back exactly when the delete fails", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.me, meWith())
    const counted = todayWith({
      totals: totalsIn(BOUNDS, [NURSED, RUNNING], [], COUNTED_AT),
      activeFeed: RUNNING,
      lastFeed: RUNNING,
      recent: [feed(RUNNING), feed(NURSED)],
    })
    queryClient.setQueryData(queryKeys.today, counted, { updatedAt: COUNTED_AT })
    const pended = await pendIn(queryClient, DELETE_RUNNING, DELETED_AT)
    expect(queryClient.getQueryData(queryKeys.today)).toEqual(
      todayWith({ totals: totalsIn(BOUNDS, [NURSED], [], COUNTED_AT), lastFeed: NURSED, recent: [feed(NURSED)] }),
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
      totals: totalsIn(BOUNDS, [NURSED, RUNNING], [], COUNTED_AT),
    })
    queryClient.setQueryData(queryKeys.day("2026-10-09"), counted)
    const pended = await pendIn(queryClient, DELETE_RUNNING, DELETED_AT)
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))?.totals).toEqual(
      totalsIn(BOUNDS, [NURSED], [], DELETED_AT),
    )
    rollBack(queryClient, DELETE_RUNNING, pended)
    expect(queryClient.getQueryData<DayPeriod>(queryKeys.day("2026-10-09"))?.feeds).toEqual([NURSED, RUNNING])
  })
})

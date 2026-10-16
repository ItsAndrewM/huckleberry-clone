import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import type { FeedAction } from "../src/api/actions.ts"
import { heldAs, retapped } from "../src/sheets/retap.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { held, start } from "./held-fixtures.ts"
import { feedAt, NOW } from "./today-fixtures.ts"

const LATER = NOW + 15 * 60_000

const nursing = (action: FeedAction): Sending => ({ sheet: "nursing", action })

const pause = (actionId: string, occurredAt = NOW, id = "feed-1", version = 3) =>
  nursing({ kind: "pauseFeed", id, payload: { actionId, version, occurredAt } })

const switchTo = (to: "left" | "right", actionId: string, occurredAt = NOW, version = 3) =>
  nursing({ kind: "switchSide", id: "feed-1", to, payload: { actionId, version, occurredAt } })

const resume = (side: "left" | "right", actionId: string, occurredAt = NOW, version = 3) =>
  nursing({ kind: "resumeFeed", id: "feed-1", payload: { actionId, version, side, occurredAt } })

const THEIRS = feedAt(NOW - 600_000, { id: "feed-1", status: "active", endedAt: null, version: 4 })

const RUNNING = feedAt(NOW - 600_000, {
  id: "feed-1",
  status: "active",
  endedAt: null,
  version: 4,
  segments: [{ id: "segment-1", side: "right", startedAt: NOW - 600_000, endedAt: null }],
})

const PAUSED = feedAt(NOW - 600_000, {
  id: "feed-1",
  status: "active",
  endedAt: null,
  version: 4,
  segments: [{ id: "segment-1", side: "right", startedAt: NOW - 600_000, endedAt: NOW - 60_000 }],
})

const conflict = (sending: Sending, current = RUNNING) => ({
  sending,
  error: new FeedConflict({ code: "STALE_VERSION", current }),
})

describe("a control tapped again while its failure is held", () => {
  it("sends the held one again, its first tap's time and actionId, as Try again does", () => {
    const first = pause("action-first")
    expect(retapped([held(first)], pause("action-later", LATER))).toBe(first)
  })

  it("keeps the first tap's time and actionId for a resume on the other side, and takes the side picked", () => {
    expect(retapped([held(resume("right", "action-first"))], resume("left", "action-later", LATER))).toEqual(
      resume("left", "action-first"),
    )
  })

  it("finds its own held failure behind another one on the sheet, such as a start that might not have been saved", () => {
    const first = pause("action-first")
    expect(retapped([held(start("action-start")), held(first)], pause("action-later", LATER))).toBe(first)
  })

  it("sends the first tap with the feed's current version when Pause anyway would still save it", () => {
    expect(retapped([conflict(pause("action-first"))], pause("action-later", LATER))).toEqual(
      pause("action-first", NOW, "feed-1", 4),
    )
  })

  it("does the same for Switch and for Resume on the side picked, as their … anyway would", () => {
    expect(retapped([conflict(switchTo("left", "action-first"))], switchTo("left", "action-later", LATER))).toEqual(
      switchTo("left", "action-first", NOW, 4),
    )
    expect(
      retapped([conflict(resume("right", "action-first"), PAUSED)], resume("left", "action-later", LATER)),
    ).toEqual(resume("left", "action-first", NOW, 4))
  })

  it("sends what was tapped when nothing would save the held one, such as a feed the other phone paused meanwhile", () => {
    const later = pause("action-later", LATER)
    expect(retapped([conflict(pause("action-first"), THEIRS)], later)).toBe(later)
  })

  it("sends what was tapped for another control, another feed or a switch the other way", () => {
    const first = [held(switchTo("right", "action-first"))]
    const otherWay = switchTo("left", "action-later", LATER)
    expect(retapped(first, otherWay)).toBe(otherWay)
    const paused = pause("action-later", LATER)
    expect(retapped(first, paused)).toBe(paused)
    const otherFeed = pause("action-later", LATER, "feed-2")
    expect(retapped([held(pause("action-first"))], otherFeed)).toBe(otherFeed)
  })

  it("sends a held delete again, as Try again does", () => {
    const remove = (actionId: string) =>
      nursing({ kind: "deleteFeed", id: "feed-1", payload: { actionId, version: 3 } })
    const first = remove("action-first")
    expect(retapped([held(first)], remove("action-later"))).toBe(first)
  })

  it("sends what was tapped when nothing is held", () => {
    const tapped = pause("action-first")
    expect(retapped([], tapped)).toBe(tapped)
  })
})

describe("the held failure a sheet's button picks up", () => {
  const finish = (id: string) =>
    nursing({
      kind: "finishFeed",
      id,
      payload: { actionId: `action-${id}`, version: 3, occurredAt: NOW, deleteIfEmpty: false },
    })

  it("is the one of its kind on its record, wherever it sits among the held", () => {
    const finished = held(finish("feed-1"))
    expect(heldAs([held(pause("action-first")), held(finish("feed-2")), finished], "finishFeed", "feed-1")).toBe(
      finished,
    )
  })

  it("is a start, which has no record yet, behind another failure", () => {
    const started = held(start("action-start"))
    expect(heldAs([held(pause("action-first")), started], "startFeed")).toBe(started)
  })

  it("is none when nothing of its kind is held on that record", () => {
    expect(heldAs([held(pause("action-first"))], "finishFeed", "feed-1")).toBeNull()
  })
})

import type { Feed } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { newBottle, newSide } from "../src/features/edit/added-parts.ts"
import { draftOf, partsOf, withAddedSide, withBottle, withoutPart, withSide } from "../src/features/edit/feed-draft.ts"
import { feedDelete, feedEdit, feedEditSession, feedNoun } from "../src/features/edit/feed-edit.ts"
import { checkedParts } from "../src/features/edit/feed-entry.ts"
import { movedBy, movedDraft, moveText, startOf } from "../src/features/edit/feed-move.ts"
import { whenAt } from "../src/sheets/when.ts"
import { feedAt, MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SECOND = 1_000
const T = NOW - 90 * MINUTE
const NURSED: Feed = feedAt(T, {
  id: "feed-1",
  version: 4,
  endedAt: T + 25 * MINUTE,
  segments: [
    { id: "s1", side: "left", startedAt: T + 23 * SECOND, endedAt: T + 14 * MINUTE + 37 * SECOND },
    { id: "s2", side: "right", startedAt: T + 14 * MINUTE + 37 * SECOND, endedAt: T + 23 * MINUTE },
  ],
  portions: [{ id: "p1", occurredAt: T + 25 * MINUTE, breastMilkMl: 0, formulaMl: 30 }],
})
const DRAFT = draftOf(partsOf(NURSED), ZONE)
const [LEFT, RIGHT] = DRAFT.sides.map(({ key, fields }) => ({ key, fields }))

const checked = (draft: typeof DRAFT) => checkedParts(draft, ZONE, NOW)

describe("a feed's draft", () => {
  it("sends every side and bottle back exactly as they were while nobody touches them", () => {
    expect(checked(DRAFT)).toEqual({ ok: true, value: partsOf(NURSED) })
  })

  it("moves the switch earlier in one edit, counting changed minutes from the minute a side shows", () => {
    if (LEFT === undefined || RIGHT === undefined) throw new Error("NURSED has two sides")
    const left = withSide(DRAFT, LEFT.key, { ...LEFT.fields, minutes: 10 })
    const both = withSide(left, RIGHT.key, { ...RIGHT.fields, start: whenAt(T + 10 * MINUTE, ZONE), minutes: 13 })
    expect(checked(both)).toMatchObject({
      ok: true,
      value: {
        segments: [
          { side: "left", startedAt: T + 23 * SECOND, endedAt: T + 10 * MINUTE },
          { side: "right", startedAt: T + 10 * MINUTE, endedAt: T + 23 * MINUTE },
        ],
      },
    })
  })

  it("keeps a side's exact start when only its minutes change, so it still meets the side before", () => {
    if (RIGHT === undefined) throw new Error("NURSED has two sides")
    const shorter = withSide(DRAFT, RIGHT.key, { ...RIGHT.fields, minutes: 5 })
    expect(checked(shorter)).toMatchObject({
      ok: true,
      value: { segments: [{}, { side: "right", startedAt: T + 14 * MINUTE + 37 * SECOND, endedAt: T + 19 * MINUTE }] },
    })
  })

  it.each([
    [
      "two sides at once",
      (draft: typeof DRAFT) =>
        RIGHT === undefined
          ? draft
          : withSide(draft, RIGHT.key, { ...RIGHT.fields, start: whenAt(T + 10 * MINUTE, ZONE) }),
      "overlap",
    ],
    [
      "a side with no minutes",
      (draft: typeof DRAFT) => (LEFT === undefined ? draft : withSide(draft, LEFT.key, { ...LEFT.fields, minutes: 0 })),
      "minutes",
    ],
    [
      "a bottle with no milk",
      (draft: typeof DRAFT) => withBottle(draft, "bottle-0", { at: whenAt(T, ZONE), breastMilkMl: 0, formulaMl: 0 }),
      "milk",
    ],
    [
      "a side ending in the future",
      (draft: typeof DRAFT) =>
        LEFT === undefined
          ? draft
          : withSide(draft, LEFT.key, { ...LEFT.fields, start: whenAt(NOW - MINUTE, ZONE), minutes: 30 }),
      "future",
    ],
    ["nothing left", (draft: typeof DRAFT) => ["side-0", "side-1", "bottle-0"].reduce(withoutPart, draft), "nothing"],
  ])("won't save %s", (_label, change, issue) => {
    expect(checked(change(DRAFT))).toEqual({ ok: false, issue })
  })

  it("adds a forgotten side where the feed ended, on the other side, five minutes long", () => {
    const fields = newSide(DRAFT, ZONE, NOW)
    expect(fields).toEqual({ side: "left", start: whenAt(T + 25 * MINUTE, ZONE), minutes: 5 })
    expect(checked(withAddedSide(DRAFT, "added", fields))).toMatchObject({ ok: true })
    expect(newBottle(DRAFT, ZONE, NOW)).toEqual({ at: whenAt(T + 25 * MINUTE, ZONE), breastMilkMl: 0, formulaMl: 0 })
  })
})

describe("moving a whole feed", () => {
  it("shifts every side and bottle by the same time, keeping their seconds", () => {
    expect(startOf(DRAFT, ZONE)).toBe(T + 23 * SECOND)
    const offset = movedBy(DRAFT, ZONE, whenAt(T + 60 * MINUTE, ZONE))
    expect(offset).toBe(60 * MINUTE)
    const moved = checked(movedDraft(DRAFT, ZONE, 60 * MINUTE))
    expect(moved.ok && moved.value.segments[0]).toEqual({
      side: "left",
      startedAt: T + 60 * MINUTE + 23 * SECOND,
      endedAt: T + 74 * MINUTE + 37 * SECOND,
    })
  })

  it("doesn't move at all when the same minute is picked again", () => {
    expect(movedBy(DRAFT, ZONE, whenAt(T, ZONE))).toBe(0)
  })

  it("says how far, and which way", () => {
    expect(moveText(65 * MINUTE)).toBe("Moves every side and bottle 1 h 5 min later.")
    expect(moveText(-20 * MINUTE)).toBe("Moves every side and bottle 20 min earlier.")
    expect(moveText(0)).toBeNull()
  })
})

describe("the feed's edit", () => {
  it("starts from the feed, or from a failed save's own values and actionId", () => {
    const session = feedEditSession(null, NURSED, ZONE)
    expect(session).toMatchObject({ actionId: expect.stringMatching(UUID), target: { id: "feed-1", version: 4 } })
    const sent = feedEdit(session, partsOf(NURSED))
    expect(sent).toEqual({
      kind: "editFeed",
      id: "feed-1",
      payload: { actionId: session.actionId, version: 4, ...partsOf(NURSED) },
    })
    const failed = { sending: { sheet: "editFeed" as const, action: sent }, error: new Offline() }
    expect(feedEditSession(failed, NURSED, ZONE)).toEqual({ ...session, draft: DRAFT })
    expect(feedDelete(session.target)).toMatchObject({ kind: "deleteFeed", id: "feed-1", payload: { version: 4 } })
  })

  it("calls a feed of one bottle a bottle, and anything else a feed", () => {
    const bottle = feedAt(T, { portions: [{ id: "p", occurredAt: T, breastMilkMl: 60, formulaMl: 0 }] })
    expect(feedNoun(bottle)).toBe("bottle")
    expect(feedNoun(NURSED)).toBe("feed")
  })
})

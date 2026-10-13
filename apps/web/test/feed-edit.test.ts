import type { Feed } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { newBottle, newSide } from "../src/features/edit/added-parts.ts"
import {
  draftOf,
  partsOf,
  withAddedBottle,
  withAddedSide,
  withBottle,
  withoutPart,
  withSide,
} from "../src/features/edit/feed-draft.ts"
import { editFeedTitle, feedDelete, feedEdit, feedEditSession, feedNoun } from "../src/features/edit/feed-edit.ts"
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

  it("reads a side's minutes as Today does, rounded down", () => {
    const long = feedAt(T, {
      endedAt: T + 14 * MINUTE + 37 * SECOND,
      segments: [{ id: "s", side: "left", startedAt: T, endedAt: T + 14 * MINUTE + 37 * SECOND }],
    })
    const draft = draftOf(partsOf(long), ZONE)
    expect(draft.sides.map(({ fields }) => fields.minutes)).toEqual([14])
    expect(checked(draft)).toEqual({ ok: true, value: partsOf(long) })
  })

  it("moves the switch earlier in one edit: a start picked inside the side before's last minute meets it", () => {
    if (LEFT === undefined || RIGHT === undefined) throw new Error("NURSED has two sides")
    const left = withSide(DRAFT, LEFT.key, { ...LEFT.fields, minutes: 10 })
    const both = withSide(left, RIGHT.key, { ...RIGHT.fields, start: whenAt(T + 10 * MINUTE, ZONE), minutes: 13 })
    expect(checked(both)).toMatchObject({
      ok: true,
      value: {
        segments: [
          { side: "left", startedAt: T + 23 * SECOND, endedAt: T + 10 * MINUTE + 23 * SECOND },
          { side: "right", startedAt: T + 10 * MINUTE + 23 * SECOND, endedAt: T + 23 * MINUTE + 23 * SECOND },
        ],
      },
    })
  })

  it("makes a side's changed minutes exactly the minutes typed, from its exact start", () => {
    if (RIGHT === undefined) throw new Error("NURSED has two sides")
    const shorter = withSide(DRAFT, RIGHT.key, { ...RIGHT.fields, minutes: 5 })
    expect(checked(shorter)).toMatchObject({
      ok: true,
      value: {
        segments: [
          {},
          { side: "right", startedAt: T + 14 * MINUTE + 37 * SECOND, endedAt: T + 19 * MINUTE + 37 * SECOND },
        ],
      },
    })
  })

  it("never moves a kept start: a side lengthened into one is refused as an overlap", () => {
    if (LEFT === undefined) throw new Error("NURSED has two sides")
    const longer = withSide(DRAFT, LEFT.key, { ...LEFT.fields, minutes: 15 })
    expect(checked(longer)).toEqual({ ok: false, issue: "overlap" })
  })

  it("meets each side as the one before was finally placed, in start order", () => {
    if (LEFT === undefined || RIGHT === undefined) throw new Error("NURSED has two sides")
    const left = withSide(DRAFT, LEFT.key, { ...LEFT.fields, minutes: 10 })
    const right = withSide(left, RIGHT.key, { ...RIGHT.fields, start: whenAt(T + 10 * MINUTE, ZONE), minutes: 13 })
    const third = { side: "left" as const, start: whenAt(T + 23 * MINUTE, ZONE), minutes: 5 }
    expect(checked(withAddedSide(right, "third", third))).toMatchObject({
      ok: true,
      value: {
        segments: [
          {},
          { side: "right", endedAt: T + 23 * MINUTE + 23 * SECOND },
          { side: "left", startedAt: T + 23 * MINUTE + 23 * SECOND, endedAt: T + 28 * MINUTE + 23 * SECOND },
        ],
      },
    })
  })

  it("keeps the sides in the order the form lists them, though it places them by their starts", () => {
    const listed = draftOf({ ...partsOf(NURSED), segments: partsOf(NURSED).segments.toReversed() }, ZONE)
    const [right, left] = listed.sides
    if (right === undefined || left === undefined) throw new Error("NURSED has two sides")
    const shorter = withSide(listed, left.key, { ...left.fields, minutes: 13 })
    const picked = withSide(shorter, right.key, { ...right.fields, start: whenAt(T + 13 * MINUTE, ZONE) })
    expect(checked(picked)).toMatchObject({
      ok: true,
      value: {
        segments: [
          { side: "right", startedAt: T + 13 * MINUTE + 23 * SECOND, endedAt: T + 21 * MINUTE + 46 * SECOND },
          { side: "left", startedAt: T + 23 * SECOND, endedAt: T + 13 * MINUTE + 23 * SECOND },
        ],
      },
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
    [
      "a bottle moved into the future",
      (draft: typeof DRAFT) => movedDraft(["side-0", "side-1"].reduce(withoutPart, draft), ZONE, 180 * MINUTE),
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

  it("starts an added side where the feed ended even after a bottle with no milk was added", () => {
    const bottled = withAddedBottle(DRAFT, "bottle", newBottle(DRAFT, ZONE, NOW))
    expect(checked(bottled)).toEqual({ ok: false, issue: "milk" })
    expect(newSide(bottled, ZONE, NOW)).toEqual({ side: "left", start: whenAt(T + 25 * MINUTE, ZONE), minutes: 5 })
    expect(newBottle(bottled, ZONE, NOW)).toEqual({ at: whenAt(T + 25 * MINUTE, ZONE), breastMilkMl: 0, formulaMl: 0 })
  })

  it("gives a feed that ended 2 minutes ago a side of 2 minutes that meets it exactly", () => {
    const ended = NOW - 2 * MINUTE - 20 * SECOND
    const recent = feedAt(ended - 10 * MINUTE, {
      endedAt: ended,
      segments: [{ id: "s", side: "right", startedAt: ended - 10 * MINUTE, endedAt: ended }],
    })
    const draft = draftOf(partsOf(recent), ZONE)
    const fields = newSide(draft, ZONE, NOW)
    expect(fields).toEqual({ side: "left", start: whenAt(ended, ZONE), minutes: 2 })
    expect(checked(withAddedSide(draft, "added", fields))).toMatchObject({
      ok: true,
      value: { segments: [{}, { side: "left", startedAt: ended, endedAt: ended + 2 * MINUTE }] },
    })
  })

  it("adds a side and a bottle at the moment of the tap when the form holds no time", () => {
    const empty = draftOf({ segments: [], portions: [] }, ZONE)
    const fields = newSide(empty, ZONE, NOW)
    expect(fields).toEqual({ side: "left", start: whenAt(NOW, ZONE), minutes: 1 })
    expect(checked(withAddedSide(empty, "added", fields))).toMatchObject({ ok: true })
    expect(newBottle(empty, ZONE, NOW)).toEqual({ at: whenAt(NOW, ZONE), breastMilkMl: 0, formulaMl: 0 })
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

  it("titles a feed of one bottle's sheet Edit bottle, and any other Edit feed", () => {
    const bottle = feedAt(T, { portions: [{ id: "p", occurredAt: T, breastMilkMl: 60, formulaMl: 0 }] })
    expect(editFeedTitle({ kind: "feed", feed: bottle })).toBe("Edit bottle")
    expect(editFeedTitle({ kind: "feed", feed: NURSED })).toBe("Edit feed")
    expect(editFeedTitle(null)).toBe("Edit feed")
  })
})

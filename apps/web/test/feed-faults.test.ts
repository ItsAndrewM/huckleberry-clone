import type { Feed } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import {
  type BottleFields,
  draftOf,
  type FeedDraft,
  partsOf,
  type SideFields,
  withBottle,
  withoutPart,
  withSide,
} from "../src/features/edit/feed-draft.ts"
import { faultsOf, linksTo } from "../src/features/edit/feed-faults.ts"
import { whenAt } from "../src/sheets/when.ts"
import { feedAt, MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const T = NOW - 90 * MINUTE
const NURSED: Feed = feedAt(T, {
  endedAt: T + 25 * MINUTE,
  segments: [
    { id: "s1", side: "left", startedAt: T, endedAt: T + 14 * MINUTE },
    { id: "s2", side: "right", startedAt: T + 14 * MINUTE, endedAt: T + 23 * MINUTE },
  ],
  portions: [{ id: "p1", occurredAt: T + 25 * MINUTE, breastMilkMl: 0, formulaMl: 30 }],
})
const DRAFT = draftOf(partsOf(NURSED), ZONE)
const [LEFT, RIGHT] = DRAFT.sides
const [BOTTLE] = DRAFT.bottles
if (LEFT === undefined || RIGHT === undefined || BOTTLE === undefined)
  throw new Error("NURSED has two sides and a bottle")

const faults = (draft: FeedDraft) => Object.fromEntries(faultsOf(draft, ZONE, NOW))
const withLeft = (draft: FeedDraft, change: Partial<SideFields>) =>
  withSide(draft, LEFT.key, { ...LEFT.fields, ...change })
const withRight = (draft: FeedDraft, change: Partial<SideFields>) =>
  withSide(draft, RIGHT.key, { ...RIGHT.fields, ...change })
const withTheBottle = (draft: FeedDraft, change: Partial<BottleFields>) =>
  withBottle(draft, BOTTLE.key, { ...BOTTLE.fields, ...change })

describe("which fields Edit feed's message is about", () => {
  it("finds nothing wrong with a draft that can be saved", () => {
    expect(faults(DRAFT)).toEqual({})
  })

  it("points a side's minutes out of range at that side's minutes alone", () => {
    expect(faults(withLeft(DRAFT, { minutes: 0 }))).toEqual({ [LEFT.key]: ["minutes"] })
  })

  it("points at every side whose minutes are out of range, since the message is about each of them", () => {
    const both = withRight(withLeft(DRAFT, { minutes: 0 }), { minutes: 241 })
    expect(faults(both)).toEqual({ [LEFT.key]: ["minutes"], [RIGHT.key]: ["minutes"] })
  })

  it("points a bottle with no milk at its amounts", () => {
    expect(faults(withTheBottle(DRAFT, { formulaMl: 0 }))).toEqual({ [BOTTLE.key]: ["amounts"] })
  })

  it("points a time that can't be read at that part's time", () => {
    const unreadable = withRight(DRAFT, { start: { kind: "at", local: "", pick: null } })
    expect(faults(unreadable)).toEqual({ [RIGHT.key]: ["time"] })
  })

  it("points only at the parts the message names, not at a part refused for another reason", () => {
    const both = withTheBottle(withLeft(DRAFT, { minutes: 0 }), { formulaMl: 0 })
    expect(faults(both)).toEqual({ [LEFT.key]: ["minutes"] })
  })

  it("points overlapping sides at both sides' start and minutes", () => {
    const early = withRight(DRAFT, { start: whenAt(T + 10 * MINUTE, ZONE) })
    expect(faults(early)).toEqual({ [LEFT.key]: ["time", "minutes"], [RIGHT.key]: ["time", "minutes"] })
  })

  it("points a side that would end in the future at its start and minutes, and no other part", () => {
    expect(faults(withRight(DRAFT, { minutes: 120 }))).toEqual({ [RIGHT.key]: ["time", "minutes"] })
  })

  it("points a side that starts in the future at its start alone", () => {
    const ahead = withRight(DRAFT, { start: whenAt(NOW + 10 * MINUTE, ZONE) })
    expect(faults(ahead)).toEqual({ [RIGHT.key]: ["time"] })
  })

  it("points a bottle given in the future at its time", () => {
    const ahead = withTheBottle(DRAFT, { at: whenAt(NOW + 10 * MINUTE, ZONE) })
    expect(faults(ahead)).toEqual({ [BOTTLE.key]: ["time"] })
  })

  it("points at nothing once every part is removed, since Delete asks instead", () => {
    const emptied = withoutPart(withoutPart(withoutPart(DRAFT, LEFT.key), RIGHT.key), BOTTLE.key)
    expect(faults(emptied)).toEqual({})
  })
})

describe("a part's links to Edit feed's message", () => {
  it("links each field the message is about, as an error that stops Save, and leaves the rest unlinked", () => {
    expect(linksTo("issue", ["time", "minutes"])).toEqual({
      time: { id: "issue", invalid: true },
      minutes: { id: "issue", invalid: true },
      amounts: undefined,
    })
    expect(linksTo("issue", [])).toEqual({ time: undefined, minutes: undefined, amounts: undefined })
  })
})

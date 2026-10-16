import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import type { FeedAction } from "../src/api/actions.ts"
import { retapped } from "../src/sheets/held.ts"
import type { Sending } from "../src/sheets/sending.ts"
import { held } from "./held-fixtures.ts"
import { feedAt, NOW } from "./today-fixtures.ts"

const LATER = NOW + 15 * 60_000

const nursing = (action: FeedAction): Sending => ({ sheet: "nursing", action })

const pause = (actionId: string, occurredAt = NOW, id = "feed-1") =>
  nursing({ kind: "pauseFeed", id, payload: { actionId, version: 3, occurredAt } })

const switchTo = (to: "left" | "right", actionId: string, occurredAt = NOW) =>
  nursing({ kind: "switchSide", id: "feed-1", to, payload: { actionId, version: 3, occurredAt } })

const resume = (side: "left" | "right", actionId: string, occurredAt = NOW) =>
  nursing({ kind: "resumeFeed", id: "feed-1", payload: { actionId, version: 3, side, occurredAt } })

const THEIRS = feedAt(NOW - 600_000, { id: "feed-1", status: "active", endedAt: null, version: 4 })

describe("a control tapped again while its failure is held", () => {
  it("sends the held one again, its first tap's time and actionId, as Try again does", () => {
    const first = pause("action-first")
    expect(retapped(held(first), pause("action-later", LATER))).toBe(first)
  })

  it("keeps the first tap's time and actionId for a resume on the other side, and takes the side picked", () => {
    expect(retapped(held(resume("right", "action-first")), resume("left", "action-later", LATER))).toEqual(
      resume("left", "action-first"),
    )
  })

  it("sends what was tapped when the note offers no Try again, such as after the other phone's change", () => {
    const refused = {
      sending: pause("action-first"),
      error: new FeedConflict({ code: "STALE_VERSION", current: THEIRS }),
    }
    const later = pause("action-later", LATER)
    expect(retapped(refused, later)).toBe(later)
  })

  it("sends what was tapped for another control, another feed or a switch the other way", () => {
    const first = held(switchTo("right", "action-first"))
    const otherWay = switchTo("left", "action-later", LATER)
    expect(retapped(first, otherWay)).toBe(otherWay)
    const paused = pause("action-later", LATER)
    expect(retapped(first, paused)).toBe(paused)
    const otherFeed = pause("action-later", LATER, "feed-2")
    expect(retapped(held(pause("action-first")), otherFeed)).toBe(otherFeed)
  })

  it("sends a held delete again, as Try again does", () => {
    const remove = (actionId: string) =>
      nursing({ kind: "deleteFeed", id: "feed-1", payload: { actionId, version: 3 } })
    const first = remove("action-first")
    expect(retapped(held(first), remove("action-later"))).toBe(first)
  })

  it("sends what was tapped when nothing is held", () => {
    const tapped = pause("action-first")
    expect(retapped(null, tapped)).toBe(tapped)
  })
})

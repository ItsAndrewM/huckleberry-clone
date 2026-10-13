import { describe, expect, it } from "vitest"
import { hiddenExcept, hiddenIn, hiddenNotice, hideInSearch, hideOf } from "../src/features/history/history-kinds.ts"

describe("History's filters", () => {
  it("reads the kinds the address hides, and nothing else", () => {
    expect([...hiddenIn("diapers,growth")]).toEqual(["diapers", "growth"])
    expect([...hiddenIn("growth,sleep,,feeds")]).toEqual(["growth", "feeds"])
    expect(hiddenIn(undefined).size).toBe(0)
  })

  it("writes the hidden kinds in one order, and nothing when all are shown", () => {
    expect(hideOf(new Set(["growth", "feeds"]))).toBe("feeds,growth")
    expect(hideOf(new Set())).toBeUndefined()
  })

  it("keeps a tidy address: known kinds in order, or none", () => {
    expect(hideInSearch("growth,diapers,growth")).toBe("diapers,growth")
    expect(hideInSearch("sleep")).toBeUndefined()
    expect(hideInSearch("")).toBeUndefined()
    expect(hideInSearch(3)).toBeUndefined()
    expect(hideInSearch(undefined)).toBeUndefined()
  })

  it("hides every kind a filter's chips leave off", () => {
    expect([...hiddenExcept(["feeds"])]).toEqual(["diapers", "growth"])
    expect(hiddenExcept(["feeds", "diapers", "growth"]).size).toBe(0)
  })
})

describe("what the switcher says is hidden", () => {
  it("says nothing while every kind shows", () => {
    expect(hiddenNotice(hiddenIn(undefined))).toBeUndefined()
  })

  it("names one hidden kind by its chip", () => {
    expect(hiddenNotice(hiddenIn("diapers"))).toBe("Diapers hidden")
  })

  it("names two or three in the chips' order, with and before the last", () => {
    expect(hiddenNotice(hiddenIn("diapers,feeds"))).toBe("Feeds and Diapers hidden")
    expect(hiddenNotice(hiddenIn("growth,diapers,feeds"))).toBe("Feeds, Diapers and Growth hidden")
  })
})

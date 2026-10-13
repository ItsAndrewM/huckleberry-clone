import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { type CalendarPoint, layoutDay } from "../../src/index.ts"
import { atMinute, BOUNDS, dayOf, SCALE } from "./fixtures.ts"

const clustersOf = (points: ReadonlyArray<CalendarPoint>) => layoutDay({ ...dayOf([]), points }, SCALE).clusters

const point = (id: string, minute: number) => ({ id, at: atMinute(minute) })

describe("layoutDay's markers", () => {
  it("gathers markers that would overlap on screen into one, in time order", () => {
    const points = [point("d", 150), point("b", 130), point("a", 120), point("c", 140)]
    expect(clustersOf(points)).toEqual([
      { top: 24, ids: ["a", "b", "c"] },
      { top: 30, ids: ["d"] },
    ])
  })

  it("orders markers at the same moment by id", () => {
    expect(clustersOf([point("z", 300), point("x", 300), point("y", 300)])).toEqual([{ top: 60, ids: ["x", "y", "z"] }])
  })

  it("keeps a marker near midnight inside the grid", () => {
    expect(clustersOf([point("late", 1439)])).toEqual([{ top: 283, ids: ["late"] }])
  })

  it("counts a marker at the day's first moment, and leaves out one at the next day's", () => {
    expect(
      clustersOf([
        { id: "first", at: BOUNDS.start },
        { id: "next", at: BOUNDS.end },
      ]),
    ).toEqual([{ top: 0, ids: ["first"] }])
  })

  it("puts every marker of the day in exactly one cluster, the clusters never overlapping", () => {
    const minutes = fc.array(fc.integer({ min: 0, max: 1439 }), { maxLength: 30 })
    fc.assert(
      fc.property(minutes, (list) => {
        const clusters = clustersOf(list.map((minute, index) => point(`p${index}`, minute)))
        expect(clusters.flatMap(({ ids }) => ids).toSorted()).toEqual(list.map((_, index) => `p${index}`).toSorted())
        const gaps = clusters.slice(1).map((next, index) => next.top - (clusters[index]?.top ?? 0))
        expect(gaps.every((gap) => gap >= SCALE.pointSteps)).toBe(true)
      }),
    )
  })
})

describe("layoutDay's now line", () => {
  it("is at now's step while now is in the day, and absent otherwise", () => {
    expect(layoutDay(dayOf([], atMinute(605)), SCALE).now).toBe(121)
    expect(layoutDay(dayOf([], BOUNDS.end), SCALE).now).toBeNull()
    expect(layoutDay(dayOf([], BOUNDS.start - 1), SCALE).now).toBeNull()
  })
})

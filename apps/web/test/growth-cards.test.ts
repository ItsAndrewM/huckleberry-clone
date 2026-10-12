import { describe, expect, it } from "vitest"
import { latestTiles, measurementCards } from "../src/features/growth/cards.ts"
import { at, LOCALE, MEASUREMENTS, measurement, meWith } from "./growth-fixtures.ts"

const ME = meWith()
const latest = (measurements = MEASUREMENTS) =>
  latestTiles(measurements, ME, LOCALE).map(({ info, latest: row }) => [info.label, row?.value, row?.measuredOn])

describe("latestTiles", () => {
  it("gives each metric its newest value, with its percentile and date", () => {
    expect(latestTiles(MEASUREMENTS, ME, LOCALE)[0]).toMatchObject({
      info: { label: "Weight" },
      latest: { value: "4.30\u00a0kg", percentile: "47th", measuredOn: "Oct 6, 2026" },
    })
  })

  it("looks past measurements without a metric to the newest one with it", () => {
    const newest = measurement("m4", at("2026-10-08", 10), { weightG: 4500 })
    expect(latest([newest, ...MEASUREMENTS])).toEqual([
      ["Weight", "4.50\u00a0kg", "Oct 8, 2026"],
      ["Length", "54.5\u00a0cm", "Oct 6, 2026"],
      ["Head", "36.8\u00a0cm", "Oct 6, 2026"],
    ])
  })

  it("names each tile by its metric, value, percentile and date, for a screen reader", () => {
    const names = latestTiles([measurement("m1", at("2026-09-01", 10), { weightG: 3200 })], ME, LOCALE).map(
      ({ name }) => name,
    )
    expect(names).toEqual(["Weight: 3.20\u00a0kg, 47th, Sep 1, 2026", "Length: none yet", "Head: none yet"])
  })

  it("has no latest for a metric never measured", () => {
    expect(latest([measurement("m1", at("2026-09-01", 10), { weightG: 3200 })])).toEqual([
      ["Weight", "3.20\u00a0kg", "Sep 1, 2026"],
      ["Length", undefined, undefined],
      ["Head", undefined, undefined],
    ])
  })

  it("says the percentile is unavailable when the curves can't give one, on the tile and in its name", () => {
    const [weight] = latestTiles(MEASUREMENTS, meWith({ child: { sex: "male" } }), LOCALE)
    expect(weight).toMatchObject({
      latest: { value: "4.30\u00a0kg", percentile: "Percentile unavailable", measuredOn: "Oct 6, 2026" },
      name: "Weight: 4.30\u00a0kg, Percentile unavailable, Oct 6, 2026",
    })
  })

  it("has a tile for each metric before the first measurement, with none yet", () => {
    expect(latestTiles([], ME, LOCALE)).toMatchObject([
      { info: { label: "Weight" }, latest: null, name: "Weight: none yet" },
      { info: { label: "Length" }, latest: null, name: "Length: none yet" },
      { info: { label: "Head" }, latest: null, name: "Head: none yet" },
    ])
  })
})

describe("measurementCards", () => {
  it("gives a card per measurement, newest first, with its date, age and three values", () => {
    const [newest, middle] = measurementCards(MEASUREMENTS, ME, () => false, LOCALE)
    expect(newest).toEqual({
      id: "m3",
      measuredOn: "Oct 6, 2026",
      age: "1\u00a0mo 5\u00a0d",
      saving: false,
      cells: [
        expect.objectContaining({ value: "4.30\u00a0kg", percentile: "47th" }),
        expect.objectContaining({ value: "54.5\u00a0cm" }),
        expect.objectContaining({ value: "36.8\u00a0cm" }),
      ],
    })
    expect(middle?.cells.map(({ value, percentile }) => [value, percentile])).toEqual([
      ["3.60\u00a0kg", "52nd"],
      [null, null],
      ["35.1\u00a0cm", "46th"],
    ])
  })

  it("marks the cards still saving", () => {
    const cards = measurementCards(MEASUREMENTS, ME, (id) => id === "m2", LOCALE)
    expect(cards.map(({ saving }) => saving)).toEqual([false, true, false])
  })

  it("shows the household's units", () => {
    const [newest] = measurementCards(
      MEASUREMENTS,
      meWith({ units: { volume: "ml", weight: "lb_oz", length: "in" } }),
      () => false,
      LOCALE,
    )
    expect(newest?.cells.map(({ value }) => value)).toEqual(["9\u00a0lb 7.7\u00a0oz", "21.5\u00a0in", "14.5\u00a0in"])
  })
})

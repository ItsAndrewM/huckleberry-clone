import type { Deleted, Me } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { type DeletedRow, deletedRows } from "../src/features/deleted/deleted-rows.ts"
import { measurement, meWith } from "./growth-fixtures.ts"
import { ANDREW, diaperAt, dosedAt, EMILY, feedAt, MINUTE, NOW, nursedFor, supplementOf } from "./today-fixtures.ts"

const ME = {
  ...meWith(),
  household: {
    ...meWith().household,
    caregivers: [
      { id: ANDREW, displayName: "Andrew" },
      { id: EMILY, displayName: "Emily" },
    ],
  },
} satisfies Me

const NOTHING = { feeds: [], diapers: [], sleeps: [], measurements: [], doses: [] } satisfies Deleted

const deletedBy = (by: string, at: number) => ({ updatedBy: by, updatedAt: at, deletedAt: at })

const spaced = (row: DeletedRow | undefined) =>
  row === undefined
    ? undefined
    : {
        title: row.title,
        detail: row.detail.map((part) => part.replace(/\s/gu, " ")),
        when: row.when.replace(/\s/gu, " "),
        deleted: row.deleted.map((part) => part.replace(/\s/gu, " ")),
      }

describe("deletedRows", () => {
  it("puts every deleted entry in one list, the newest deletion first", () => {
    const deleted = {
      feeds: [feedAt(NOW - 90 * MINUTE, { id: "feed-1", ...deletedBy(ANDREW, NOW - 30 * MINUTE) })],
      diapers: [diaperAt(NOW - 60 * MINUTE, { id: "diaper-1", ...deletedBy(EMILY, NOW - 10 * MINUTE) })],
      sleeps: [],
      measurements: [
        { ...measurement("m1", NOW - 120 * MINUTE, { weightG: 4210.5 }), ...deletedBy(ANDREW, NOW - 20 * MINUTE) },
      ],
      doses: [],
    } satisfies Deleted
    expect(deletedRows(deleted, ME, "en-US").map(({ id }) => id)).toEqual(["diaper-1", "m1", "feed-1"])
  })

  it("words a diaper as Today does, with when it happened and who deleted it when", () => {
    const diaper = diaperAt(NOW - 50 * MINUTE, { wet: true, dirty: true, ...deletedBy(EMILY, NOW) })
    const [row] = deletedRows({ ...NOTHING, diapers: [diaper] }, ME, "en-US")
    expect(row).toMatchObject({ id: diaper.id, icon: "diaper", record: { kind: "diaper", diaper } })
    expect(spaced(row)).toEqual({
      title: "Diaper",
      detail: ["Pee and poo"],
      when: "Fri, Oct 9, 8:40 AM",
      deleted: ["Deleted by Emily", "Fri, Oct 9, 9:30 AM"],
    })
  })

  it("words a nursing feed and a bottle as Today does, in the household's volume unit", () => {
    const nursed = nursedFor(feedAt(NOW - 60 * MINUTE, { id: "feed-1", ...deletedBy(ANDREW, NOW) }), "left", 15)
    const bottle = feedAt(NOW - 30 * MINUTE, {
      id: "feed-2",
      portions: [{ id: "portion-1", occurredAt: NOW - 30 * MINUTE, breastMilkMl: 90, formulaMl: 30 }],
      ...deletedBy(ANDREW, NOW - MINUTE),
    })
    const rows = deletedRows({ ...NOTHING, feeds: [nursed, bottle] }, ME, "en-US")
    expect(rows.map(({ icon }) => icon)).toEqual(["nursing", "bottle"])
    expect(rows.map(spaced).map((row) => [row?.title, row?.detail])).toEqual([
      ["Nursing", ["Left 15 min"]],
      ["Bottle", ["120 mL"]],
    ])
  })

  it("says a feed was running or paused when it was deleted, and counts its time up to the delete", () => {
    const running = {
      ...feedAt(NOW - 20 * MINUTE, { id: "feed-1", status: "active", endedAt: null, ...deletedBy(ANDREW, NOW) }),
      segments: [{ id: "segment-1", side: "right", startedAt: NOW - 20 * MINUTE, endedAt: null }],
    } as const
    const paused = {
      ...running,
      id: "feed-2",
      segments: [{ id: "segment-2", side: "left", startedAt: NOW - 20 * MINUTE, endedAt: NOW - 5 * MINUTE }],
    } as const
    const rows = deletedRows({ ...NOTHING, feeds: [running, paused] }, ME, "en-US")
    expect(rows.map(spaced).map((row) => row?.detail)).toEqual([
      ["Running when deleted", "Right 20 min"],
      ["Paused when deleted", "Left 15 min"],
    ])
  })

  it("words a measurement's values in the household's units, leaving out a metric it doesn't have", () => {
    const measured = {
      ...measurement("m1", NOW - 60 * MINUTE, { weightG: 4210.5, headCm: 37.5 }),
      ...deletedBy(ANDREW, NOW),
    }
    const [row] = deletedRows({ ...NOTHING, measurements: [measured] }, ME, "en-US")
    expect(row).toMatchObject({ icon: "measurement", record: { kind: "measurement", measurement: measured } })
    expect(spaced(row)).toMatchObject({ title: "Measurement", detail: ["Weight 4.21 kg", "Head 37.5 cm"] })
  })

  it("names a deleted dose by its supplement as it is now, with the dose it was given at", () => {
    const me = { ...ME, household: { ...ME.household, supplements: [supplementOf({ name: "Vitamin D3" })] } }
    const dose = dosedAt(NOW - 120 * MINUTE, { id: "dose-1", ...deletedBy(EMILY, NOW - 10 * MINUTE) })
    const [row] = deletedRows({ ...NOTHING, doses: [dose] }, me, "en-US")
    expect(row).toMatchObject({ id: "dose-1", icon: "dose", record: { kind: "dose", dose } })
    expect(spaced(row)).toEqual({
      title: "Vitamin D3",
      detail: ["400 IU"],
      when: "Fri, Oct 9, 7:30 AM",
      deleted: ["Deleted by Emily", "Fri, Oct 9, 9:20 AM"],
    })
  })

  it("says only when an entry was deleted when it can't name who did", () => {
    const diaper = diaperAt(NOW - 50 * MINUTE, deletedBy("caregiver-gone", NOW))
    const [row] = deletedRows({ ...NOTHING, diapers: [diaper] }, ME, "en-US")
    expect(spaced(row)?.deleted).toEqual(["Deleted", "Fri, Oct 9, 9:30 AM"])
  })
})

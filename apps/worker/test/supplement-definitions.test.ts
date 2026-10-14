import { NotFound, SupplementConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { addSupplement, editSupplement, supplementsOf } from "../src/core/supplements/definitions.ts"
import { ACTION_ID, ANDREW, caregiverId, EMILY, inHousehold, NOW, saved, stampOf } from "./fixtures.ts"

const LATER = NOW + 60_000

const iron = { actionId: ACTION_ID, name: "Iron", dose: "1 mL" }

describe("a new household's supplements", () => {
  it("hold Vitamin D at 400 IU, seeded with no author and given until it's stopped", async () => {
    expect(await inHousehold((sql) => supplementsOf(sql))).toEqual([
      {
        id: expect.any(String),
        name: "Vitamin D",
        dose: "400 IU",
        stoppedAt: null,
        version: 1,
        createdBy: null,
        createdAt: expect.any(Number),
        updatedBy: null,
        updatedAt: expect.any(Number),
      },
    ])
  })
})

describe("addSupplement", () => {
  it("adds a supplement as version 1, stamped with who added it, after the ones already there", async () => {
    const { result, listed, andrew } = await inHousehold((sql) => {
      const result = addSupplement(stampOf(sql), iron)(sql)
      return { result, listed: supplementsOf(sql).map(({ name }) => name), andrew: caregiverId(sql, ANDREW.email) }
    })
    expect(result).toEqual({
      ok: true,
      response: {
        id: expect.any(String),
        name: "Iron",
        dose: "1 mL",
        stoppedAt: null,
        version: 1,
        createdBy: andrew,
        createdAt: NOW,
        updatedBy: andrew,
        updatedAt: NOW,
      },
      changed: [["me"]],
    })
    expect(listed).toEqual(["Vitamin D", "Iron"])
  })
})

describe("editSupplement", () => {
  it("renames a supplement and changes its dose as the next version, stamped with who saved it", async () => {
    const { added, edited, emily } = await inHousehold((sql) => {
      const added = saved(addSupplement(stampOf(sql), iron)(sql))
      const edit = { actionId: ACTION_ID, version: 1, name: "Iron drops", dose: "0.5 mL", stopped: false }
      const edited = editSupplement(stampOf(sql, EMILY.email, LATER), added.id, edit)(sql)
      return { added, edited, emily: caregiverId(sql, EMILY.email) }
    })
    expect(edited).toEqual({
      ok: true,
      response: { ...added, name: "Iron drops", dose: "0.5 mL", version: 2, updatedBy: emily, updatedAt: LATER },
      changed: [["me"]],
    })
  })

  it("stops a supplement when it's saved stopped, keeps the first stop's time, and gives it again when saved given", async () => {
    const { stopped, still, given } = await inHousehold((sql) => {
      const added = saved(addSupplement(stampOf(sql), iron)(sql))
      const edit = (version: number, stopped: boolean, now: number) =>
        saved(editSupplement(stampOf(sql, ANDREW.email, now), added.id, { ...iron, version, stopped })(sql))
      return { stopped: edit(1, true, NOW), still: edit(2, true, LATER), given: edit(3, false, LATER) }
    })
    expect(stopped.stoppedAt).toBe(NOW)
    expect(still.stoppedAt).toBe(NOW)
    expect(given.stoppedAt).toBeNull()
  })

  it("answers STALE_VERSION with the supplement as it is now, and changes nothing", async () => {
    const { result, current } = await inHousehold((sql) => {
      const [vitaminD] = supplementsOf(sql)
      if (vitaminD === undefined) throw new Error("expected the seeded Vitamin D")
      const stale = { actionId: ACTION_ID, version: 2, name: "Vitamin D3", dose: "800 IU", stopped: false }
      return { result: editSupplement(stampOf(sql), vitaminD.id, stale)(sql), current: vitaminD }
    })
    expect(result).toEqual({ ok: false, error: new SupplementConflict({ code: "STALE_VERSION", current }) })
  })

  it("answers NotFound for a supplement the household doesn't hold", async () => {
    const result = await inHousehold((sql) =>
      editSupplement(stampOf(sql), "no-such-supplement", { ...iron, version: 1, stopped: false })(sql),
    )
    expect(result).toEqual({ ok: false, error: new NotFound() })
  })
})

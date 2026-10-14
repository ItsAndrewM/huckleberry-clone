import {
  InvalidInput,
  type Me,
  NewSupplement,
  type Supplement,
  SupplementConflict,
  SupplementEdit,
} from "@bt/contracts"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { saveSupplement, withSavedSupplement } from "../src/api/supplements.ts"
import { meWith } from "./growth-fixtures.ts"
import { supplementOf } from "./today-fixtures.ts"

const ORIGIN = "https://bt.example.test"
const VITAMIN_D = supplementOf()
const IRON = supplementOf({ id: "supplement-iron", name: "Iron", dose: "1 mL", createdBy: "caregiver-andrew" })

const decodeEdit = Schema.decodeUnknownSync(SupplementEdit)
const decodeNew = Schema.decodeUnknownSync(NewSupplement)
const OPENING = "6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f"

const json = (status: number, body: Schema.Json) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const stale = (current: Supplement) => json(409, { _tag: "Conflict", code: "STALE_VERSION", current })

const householdAnswering = (...answers: Response[]) => {
  const sent: Array<{ readonly method: string; readonly path: string; readonly body: Schema.Json }> = []
  const api = connectApi({
    baseUrl: ORIGIN,
    report: () => undefined,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      sent.push({ method: request.method, path: new URL(request.url).pathname, body: await request.json() })
      return answers.shift() ?? json(500, {})
    },
  })
  return { api, sent }
}

describe("saveSupplement", () => {
  it("adds a supplement with its name and dose at /api/supplements", async () => {
    const { api, sent } = householdAnswering(json(201, { supplement: IRON, changed: [["me"]] }))
    await expect(saveSupplement(api, null, { name: "Iron", dose: "1 mL", stopped: false }, OPENING)).resolves.toEqual({
      supplement: IRON,
      changed: [["me"]],
    })
    expect(sent).toEqual([
      { method: "POST", path: "/api/supplements", body: { actionId: expect.any(String), name: "Iron", dose: "1 mL" } },
    ])
  })

  it("adds under the actionId its sheet opened with, so a tap again after a lost answer adds the supplement once", async () => {
    const { api, sent } = householdAnswering(json(500, {}), json(201, { supplement: IRON, changed: [["me"]] }))
    const fields = { name: "Iron", dose: "1 mL", stopped: false }
    await expect(saveSupplement(api, null, fields, OPENING)).rejects.toBeInstanceOf(Error)
    await saveSupplement(api, null, fields, OPENING)
    expect(sent.map(({ body }) => decodeNew(body).actionId)).toEqual([OPENING, OPENING])
  })

  it("edits under a new actionId each time, since a tap again after a lost answer meets STALE_VERSION and goes on top", async () => {
    const saved = { supplement: { ...VITAMIN_D, dose: "600 IU", version: 2 }, changed: [["me"]] }
    const { api, sent } = householdAnswering(json(200, saved))
    await saveSupplement(api, VITAMIN_D, { name: "Vitamin D", dose: "600 IU", stopped: false }, OPENING)
    expect(sent.map(({ body }) => decodeEdit(body).actionId)).not.toContain(OPENING)
  })

  it("saves a new name, dose or stop at /api/supplements/:id from the version shown", async () => {
    const stopped = { ...VITAMIN_D, name: "Vitamin D3", stoppedAt: Date.UTC(2026, 9, 9), version: 2 }
    const { api, sent } = householdAnswering(json(200, { supplement: stopped, changed: [["me"]] }))
    await saveSupplement(api, VITAMIN_D, { name: "Vitamin D3", dose: "400 IU", stopped: true }, OPENING)
    expect(sent).toEqual([
      {
        method: "PATCH",
        path: `/api/supplements/${VITAMIN_D.id}`,
        body: { actionId: expect.any(String), version: 1, name: "Vitamin D3", dose: "400 IU", stopped: true },
      },
    ])
  })

  it("puts its change on top of the other phone's newer copy once, keeping what that phone changed and this one didn't", async () => {
    const theirs = { ...VITAMIN_D, dose: "800 IU", version: 2 }
    const saved = { ...theirs, name: "Vitamin D3", version: 3 }
    const { api, sent } = householdAnswering(
      json(409, { _tag: "Conflict", code: "STALE_VERSION", current: theirs }),
      json(200, { supplement: saved, changed: [["me"]] }),
    )
    await expect(
      saveSupplement(api, VITAMIN_D, { name: "Vitamin D3", dose: "400 IU", stopped: false }, OPENING),
    ).resolves.toMatchObject({ supplement: saved })
    expect(sent.map(({ body }) => body)).toEqual([
      { actionId: expect.any(String), version: 1, name: "Vitamin D3", dose: "400 IU", stopped: false },
      { actionId: expect.any(String), version: 2, name: "Vitamin D3", dose: "800 IU", stopped: false },
    ])
  })

  it("keeps the other phone's new name and stop when this phone changed only the dose", async () => {
    const theirs = { ...VITAMIN_D, name: "Vitamin D3", stoppedAt: Date.UTC(2026, 9, 9), version: 2 }
    const saved = { ...theirs, dose: "600 IU", version: 3 }
    const { api, sent } = householdAnswering(
      json(409, { _tag: "Conflict", code: "STALE_VERSION", current: theirs }),
      json(200, { supplement: saved, changed: [["me"]] }),
    )
    await saveSupplement(api, VITAMIN_D, { name: "Vitamin D", dose: "600 IU", stopped: false }, OPENING)
    expect(sent.map(({ body }) => body).at(-1)).toEqual({
      actionId: expect.any(String),
      version: 2,
      name: "Vitamin D3",
      dose: "600 IU",
      stopped: true,
    })
  })

  it("resends on top of the other phone's copy under a new actionId", async () => {
    const theirs = { ...VITAMIN_D, dose: "800 IU", version: 2 }
    const { api, sent } = householdAnswering(
      stale(theirs),
      json(200, { supplement: { ...theirs, name: "Vitamin D3", version: 3 }, changed: [["me"]] }),
    )
    await saveSupplement(api, VITAMIN_D, { name: "Vitamin D3", dose: "400 IU", stopped: false }, OPENING)
    expect(sent).toHaveLength(2)
    expect(new Set(sent.map(({ body }) => decodeEdit(body).actionId)).size).toBe(2)
  })

  it("shows a second STALE_VERSION after exactly two sends, when the other phone saved again meanwhile", async () => {
    const theirs = { ...VITAMIN_D, dose: "800 IU", version: 2 }
    const again = { ...theirs, dose: "1000 IU", version: 3 }
    const { api, sent } = householdAnswering(
      stale(theirs),
      stale(again),
      json(200, { supplement: { ...again, name: "Vitamin D3", version: 4 }, changed: [["me"]] }),
    )
    const saving = saveSupplement(api, VITAMIN_D, { name: "Vitamin D3", dose: "400 IU", stopped: false }, OPENING)
    await expect(saving).rejects.toBeInstanceOf(SupplementConflict)
    await expect(saving).rejects.toMatchObject({ code: "STALE_VERSION", current: again })
    expect(sent).toHaveLength(2)
  })

  it("shows any other conflict at once, without sending again", async () => {
    const { api, sent } = householdAnswering(
      json(409, { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: VITAMIN_D }),
      json(200, { supplement: { ...VITAMIN_D, name: "Vitamin D3", version: 2 }, changed: [["me"]] }),
    )
    const saving = saveSupplement(api, VITAMIN_D, { name: "Vitamin D3", dose: "400 IU", stopped: false }, OPENING)
    await expect(saving).rejects.toMatchObject({ code: "ACTION_REPLAY_MISMATCH", current: VITAMIN_D })
    expect(sent).toHaveLength(1)
  })

  it.each([
    ["an add", null],
    ["an edit", VITAMIN_D],
  ])("refuses a blank name and a dose over 40 characters on %s before sending, naming each field", async (_, shown) => {
    const { api, sent } = householdAnswering()
    await expect(
      saveSupplement(api, shown, { name: "", dose: "x".repeat(41), stopped: false }, OPENING),
    ).rejects.toEqual(
      new InvalidInput({
        fieldErrors: [
          { path: "name", issue: "invalid" },
          { path: "dose", issue: "invalid" },
        ],
      }),
    )
    expect(sent).toEqual([])
  })
})

describe("withSavedSupplement", () => {
  it("shows a saved supplement in its place, and a new one after the others", () => {
    const me: Me = { ...meWith(), household: { ...meWith().household, supplements: [VITAMIN_D, IRON] } }
    const renamed = { ...VITAMIN_D, name: "Vitamin D3", version: 2 }
    expect(withSavedSupplement(me, renamed).household.supplements).toEqual([renamed, IRON])
    const probiotic = supplementOf({ id: "supplement-probiotic", name: "Probiotic", dose: "" })
    expect(withSavedSupplement(me, probiotic).household.supplements).toEqual([VITAMIN_D, IRON, probiotic])
  })
})

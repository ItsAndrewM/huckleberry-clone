import { HouseholdConflict, HouseholdEdit, InvalidInput, type Me, queryKeys } from "@bt/contracts"
import { QueryClient } from "@tanstack/react-query"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { connectApi } from "../src/api/client.ts"
import { rememberSaved, saveChild, saveHousehold } from "../src/api/settings.ts"

const ORIGIN = "https://bt.example.test"
const AT = Date.UTC(2026, 9, 8)
const CHANGED = [queryKeys.me, queryKeys.today, queryKeys.last24h]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const HOUSEHOLD = {
  name: "Home",
  timeZone: "America/Vancouver",
  units: { volume: "ml", weight: "kg", length: "cm" },
  version: 1,
  updatedBy: null,
  updatedAt: AT,
} as const

const CHILD = {
  name: "Robin",
  birthDate: "2026-09-01",
  sex: "female",
  gestationalAgeDays: 281,
  version: 1,
  updatedBy: null,
  updatedAt: AT,
} as const

const decodeHouseholdEdit = Schema.decodeUnknownSync(Schema.toCodecJson(HouseholdEdit))

const json = (status: number, body: Schema.Json) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const stale = (current: Schema.Json) => json(409, { _tag: "Conflict", code: "STALE_VERSION", current })

const householdAnswering = (...answers: Response[]) => {
  const bodies: Schema.Json[] = []
  const api = connectApi({
    baseUrl: ORIGIN,
    report: () => undefined,
    fetch: async (input, init) => {
      bodies.push(await new Request(input, init).json())
      const answer = answers.shift()
      if (answer === undefined) throw new Error("no answer left")
      return answer
    },
  })
  return { api, bodies }
}

describe("saveHousehold", () => {
  it("saves a unit on the household it was shown, keeping the zone and the other units", async () => {
    const saved = { household: { ...HOUSEHOLD, version: 2 }, changed: CHANGED }
    const { api, bodies } = householdAnswering(json(200, saved))
    await expect(saveHousehold(api, HOUSEHOLD, { units: { volume: "fl_oz" } })).resolves.toEqual(saved)
    expect(bodies).toEqual([
      {
        actionId: expect.stringMatching(UUID),
        version: 1,
        timeZone: "America/Vancouver",
        units: { volume: "fl_oz", weight: "kg", length: "cm" },
      },
    ])
  })

  it("puts the change on the household the other phone saved, once, with a new actionId, when told it's stale", async () => {
    const theirs = {
      ...HOUSEHOLD,
      timeZone: "Europe/London",
      units: { ...HOUSEHOLD.units, weight: "lb_oz" },
      version: 2,
    }
    const { api, bodies } = householdAnswering(stale(theirs), json(200, { household: theirs, changed: CHANGED }))
    await saveHousehold(api, HOUSEHOLD, { units: { volume: "fl_oz" } })
    expect(bodies[1]).toEqual({
      actionId: expect.stringMatching(UUID),
      version: 2,
      timeZone: "Europe/London",
      units: { volume: "fl_oz", weight: "lb_oz", length: "cm" },
    })
    expect(new Set(bodies.map((body) => decodeHouseholdEdit(body).actionId)).size).toBe(2)
  })

  it("gives up after a second stale answer, and passes any other refusal straight through", async () => {
    const twice = householdAnswering(stale({ ...HOUSEHOLD, version: 2 }), stale({ ...HOUSEHOLD, version: 3 }))
    await expect(saveHousehold(twice.api, HOUSEHOLD, { timeZone: "Asia/Tokyo" })).rejects.toBeInstanceOf(
      HouseholdConflict,
    )
    expect(twice.bodies).toHaveLength(2)
    const refused = householdAnswering(
      json(400, { _tag: "InvalidInput", fieldErrors: [{ path: "timeZone", issue: "invalid" }] }),
    )
    await expect(saveHousehold(refused.api, HOUSEHOLD, { timeZone: "Asia/Tokyo" })).rejects.toBeInstanceOf(InvalidInput)
    expect(refused.bodies).toHaveLength(1)
  })
})

describe("rememberSaved", () => {
  it("shows the saved record at once, and refetches every other key it changed", () => {
    const queryClient = new QueryClient()
    const me: Me = {
      caregiver: { id: "caregiver-1", email: "andrew@example.test", displayName: "Andrew" },
      household: { ...HOUSEHOLD, caregivers: [] },
      child: CHILD,
    }
    queryClient.setQueryData(queryKeys.me, me)
    queryClient.setQueryData(queryKeys.today, "today's answer")
    const saved = { ...HOUSEHOLD, timeZone: "Asia/Tokyo", version: 2 }
    rememberSaved(queryClient, (cached) => ({ ...cached, household: { ...saved, caregivers: [] } }), CHANGED)
    expect(queryClient.getQueryData<Me>(queryKeys.me)?.household.timeZone).toBe("Asia/Tokyo")
    expect(queryClient.getQueryState(queryKeys.me)?.isInvalidated).toBe(false)
    expect(queryClient.getQueryState(queryKeys.today)?.isInvalidated).toBe(true)
  })
})

describe("saveChild", () => {
  it("names each field the household would refuse, a blank name, a blank birth date and an age at birth out of range, and sends nothing", async () => {
    const { api, bodies } = householdAnswering()
    const fields = { name: "", birthDate: "", sex: "female", gestationalAgeDays: 50 } as const
    const refusal = await saveChild(api, CHILD, fields).catch((error: Error) => error)
    expect(refusal).toBeInstanceOf(InvalidInput)
    expect(refusal).toMatchObject({
      fieldErrors: [
        { path: "name", issue: "invalid" },
        { path: "birthDate", issue: "invalid" },
        { path: "gestationalAgeDays", issue: "invalid" },
      ],
    })
    expect(bodies).toEqual([])
  })

  it("sends the fields this parent changed on top of the child the other phone saved", async () => {
    const theirs = { ...CHILD, birthDate: "2026-08-30", version: 2 }
    const { api, bodies } = householdAnswering(stale(theirs), json(200, { child: theirs, changed: CHANGED }))
    await saveChild(api, CHILD, { name: "Robin Rae", birthDate: "2026-09-01", sex: "female", gestationalAgeDays: 281 })
    expect(bodies).toEqual([
      {
        actionId: expect.stringMatching(UUID),
        version: 1,
        name: "Robin Rae",
        birthDate: "2026-09-01",
        sex: "female",
        gestationalAgeDays: 281,
      },
      {
        actionId: expect.stringMatching(UUID),
        version: 2,
        name: "Robin Rae",
        birthDate: "2026-08-30",
        sex: "female",
        gestationalAgeDays: 281,
      },
    ])
  })
})

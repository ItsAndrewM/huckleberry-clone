import { FeedConflict, MeasurementConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { connectApi } from "../src/api/client.ts"
import { send } from "../src/api/send.ts"
import { measurement } from "./growth-fixtures.ts"
import { diaperAt, feedAt, NOW } from "./today-fixtures.ts"

const ORIGIN = "https://bt.example.test"
const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const AT = { actionId: ACTION_ID, version: 2, occurredAt: NOW }
const SAVED_FEED = JSON.stringify({ feed: feedAt(NOW, { id: "feed-1" }), changed: [["today"]] })

const json = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "application/json" } })

const household = (status: number, body: string) => {
  const requests: Request[] = []
  const api = connectApi({
    baseUrl: ORIGIN,
    report: () => undefined,
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return json(status, body)
    },
  })
  return { api, requests }
}

const BOTTLE = { occurredAt: NOW, breastMilkMl: 60, formulaMl: 0 }

const STORED_MEASUREMENT = measurement("m1", NOW, { weightG: 4300, headCm: 36.8 })

const ROUTES: ReadonlyArray<readonly [Action, string, string, number]> = [
  [{ kind: "logFeed", payload: { actionId: ACTION_ID, segments: [], portions: [BOTTLE] } }, "POST", "/api/feeds", 201],
  [
    { kind: "startFeed", payload: { actionId: ACTION_ID, side: "left", startedAt: NOW } },
    "POST",
    "/api/feeds/start",
    201,
  ],
  [{ kind: "switchSide", id: "feed-1", payload: AT }, "POST", "/api/feeds/feed-1/switch", 200],
  [{ kind: "pauseFeed", id: "feed-1", payload: AT }, "POST", "/api/feeds/feed-1/pause", 200],
  [{ kind: "resumeFeed", id: "feed-1", payload: { ...AT, side: "right" } }, "POST", "/api/feeds/feed-1/resume", 200],
  [{ kind: "addBottle", id: "feed-1", payload: { ...AT, ...BOTTLE } }, "POST", "/api/feeds/feed-1/bottle", 200],
  [
    { kind: "finishFeed", id: "feed-1", payload: { ...AT, deleteIfEmpty: false } },
    "POST",
    "/api/feeds/feed-1/finish",
    200,
  ],
  [
    { kind: "deleteFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 2 } },
    "DELETE",
    "/api/feeds/feed-1",
    200,
  ],
  [
    { kind: "deletePortion", id: "portion-1", payload: { actionId: ACTION_ID, version: 2, deleteIfEmpty: false } },
    "DELETE",
    "/api/portions/portion-1",
    200,
  ],
  [
    { kind: "editPortion", id: "portion-1", payload: { ...AT, ...BOTTLE, breastMilkMl: 90 } },
    "PATCH",
    "/api/portions/portion-1",
    200,
  ],
]

describe("send", () => {
  it.each(ROUTES)("sends %j to its endpoint with its payload", async (action, method, path, status) => {
    const { api, requests } = household(status, SAVED_FEED)
    await expect(send(api, action)).resolves.toMatchObject({ feed: { id: "feed-1" } })
    const [request] = requests
    expect([request?.method, request?.url]).toEqual([method, `${ORIGIN}${path}`])
    expect(await request?.json()).toEqual(action.payload)
  })

  it("logs and deletes diapers at /api/diapers", async () => {
    const saved = JSON.stringify({ diaper: diaperAt(NOW, { id: "diaper-1" }), changed: [] })
    const log = household(201, saved)
    const payload = { actionId: ACTION_ID, occurredAt: NOW, wet: true, dirty: false }
    await expect(send(log.api, { kind: "logDiaper", payload })).resolves.toMatchObject({ diaper: { id: "diaper-1" } })
    const remove = household(200, saved)
    await send(remove.api, { kind: "deleteDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 1 } })
    expect([...log.requests, ...remove.requests].map(({ method, url }) => [method, url])).toEqual([
      ["POST", `${ORIGIN}/api/diapers`],
      ["DELETE", `${ORIGIN}/api/diapers/diaper-1`],
    ])
  })

  it("edits a diaper at /api/diapers/:id with its payload", async () => {
    const saved = JSON.stringify({ diaper: diaperAt(NOW, { id: "diaper-1", version: 3 }), changed: [] })
    const { api, requests } = household(200, saved)
    const payload = { ...AT, wet: false, dirty: true }
    const edit = send(api, { kind: "editDiaper", id: "diaper-1", payload })
    await expect(edit).resolves.toMatchObject({ diaper: { id: "diaper-1", version: 3 } })
    const [request] = requests
    expect([request?.method, request?.url]).toEqual(["PATCH", `${ORIGIN}/api/diapers/diaper-1`])
    expect(await request?.json()).toEqual(payload)
  })

  it("logs, edits and deletes measurements at /api/growth", async () => {
    const saved = JSON.stringify({ measurement: STORED_MEASUREMENT, changed: [["growth"]] })
    const values = { measuredAt: NOW, weightG: 4300, lengthCm: null, headCm: 36.8 }
    const actions: ReadonlyArray<readonly [Action, number]> = [
      [{ kind: "logMeasurement", payload: { actionId: ACTION_ID, ...values } }, 201],
      [{ kind: "editMeasurement", id: "m1", payload: { actionId: ACTION_ID, version: 1, ...values } }, 200],
      [{ kind: "deleteMeasurement", id: "m1", payload: { actionId: ACTION_ID, version: 2 } }, 200],
    ]
    const sent = []
    for (const [action, status] of actions) {
      const { api, requests } = household(status, saved)
      await expect(send(api, action)).resolves.toMatchObject({ measurement: { id: "m1" } })
      for (const request of requests) sent.push([request.method, request.url, await request.json()])
    }
    expect(sent).toEqual([
      ["POST", `${ORIGIN}/api/growth`, actions[0]?.[0].payload],
      ["PATCH", `${ORIGIN}/api/growth/m1`, actions[1]?.[0].payload],
      ["DELETE", `${ORIGIN}/api/growth/m1`, actions[2]?.[0].payload],
    ])
  })

  it("restores a diaper, a feed and a measurement at their restore endpoints, with the version the delete answered", async () => {
    const payload = { actionId: ACTION_ID, version: 2 }
    const answers: ReadonlyArray<readonly [Action, string, string]> = [
      [
        { kind: "restoreDiaper", id: "diaper-1", payload },
        JSON.stringify({ diaper: diaperAt(NOW, { id: "diaper-1", version: 3 }), changed: [] }),
        "/api/diapers/diaper-1/restore",
      ],
      [{ kind: "restoreFeed", id: "feed-1", payload }, SAVED_FEED, "/api/feeds/feed-1/restore"],
      [
        { kind: "restoreMeasurement", id: "m1", payload },
        JSON.stringify({ measurement: STORED_MEASUREMENT, changed: [] }),
        "/api/growth/m1/restore",
      ],
    ]
    const sent = []
    for (const [action, answer] of answers) {
      const { api, requests } = household(200, answer)
      await send(api, action)
      for (const request of requests) sent.push([request.method, request.url, await request.json()])
    }
    expect(sent).toEqual(answers.map(([, , path]) => ["POST", `${ORIGIN}${path}`, payload]))
  })

  it("decodes the household's conflict with its copy of the measurement", async () => {
    const current = { ...STORED_MEASUREMENT, version: 3 }
    const { api } = household(409, JSON.stringify({ _tag: "Conflict", code: "STALE_VERSION", current }))
    const payload = { actionId: ACTION_ID, version: 2, measuredAt: NOW, weightG: 4300, lengthCm: null, headCm: null }
    const failure = send(api, { kind: "editMeasurement", id: "m1", payload })
    await expect(failure).rejects.toBeInstanceOf(MeasurementConflict)
    await expect(failure).rejects.toMatchObject({ code: "STALE_VERSION", current: { version: 3 } })
  })

  it("decodes the household's conflict with its copy of the feed", async () => {
    const current = feedAt(NOW, { id: "feed-1", version: 3 })
    const { api } = household(409, JSON.stringify({ _tag: "Conflict", code: "STALE_VERSION", current }))
    const failure = send(api, { kind: "pauseFeed", id: "feed-1", payload: AT })
    await expect(failure).rejects.toBeInstanceOf(FeedConflict)
    await expect(failure).rejects.toMatchObject({ code: "STALE_VERSION", current: { version: 3 } })
  })
})

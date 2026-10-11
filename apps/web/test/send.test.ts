import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import type { Action } from "../src/api/actions.ts"
import { connectApi } from "../src/api/client.ts"
import { send } from "../src/api/send.ts"
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

  it("decodes the household's conflict with its copy of the feed", async () => {
    const current = feedAt(NOW, { id: "feed-1", version: 3 })
    const { api } = household(409, JSON.stringify({ _tag: "Conflict", code: "STALE_VERSION", current }))
    const failure = send(api, { kind: "pauseFeed", id: "feed-1", payload: AT })
    await expect(failure).rejects.toBeInstanceOf(FeedConflict)
    await expect(failure).rejects.toMatchObject({ code: "STALE_VERSION", current: { version: 3 } })
  })
})

import { Changed, Feed, SavedFeed } from "@bt/contracts"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ANDREW, CHANGED_TODAY, EMILY, MINUTE_MS, minutesAgo, NOW, seededHousehold } from "./fixtures.ts"
import { type Household, inStorage, send, sendJson, sha256 } from "./requests.ts"

const decodeSaved = Schema.decodeUnknownSync(Schema.toCodecJson(SavedFeed))

const savedFeed = async (household: Household, method: string, path: string, body: Schema.Json) =>
  decodeSaved((await sendJson(household, method, path, body)).body).feed

const start = (startedAt = minutesAgo(30)) => ({ actionId: crypto.randomUUID(), side: "left", startedAt })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("POST /api/feeds and POST /api/feeds/start", () => {
  it("log a completed feed with 201, no-store, the feed and the keys it changed", async () => {
    const household = await seededHousehold()
    const entry = {
      actionId: crypto.randomUUID(),
      segments: [{ side: "left", startedAt: minutesAgo(60), endedAt: minutesAgo(45) }],
      portions: [{ occurredAt: minutesAgo(40), breastMilkMl: 40, formulaMl: 20 }],
    }
    const response = await send(household, "POST", "/api/feeds", JSON.stringify(entry))
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({
      feed: { status: "completed", startedAt: minutesAgo(60), endedAt: minutesAgo(40), version: 1 },
      changed: CHANGED_TODAY,
    })
  })

  it("answer a retried start whose answer was lost with the stored 201, not FEED_ALREADY_ACTIVE, and keep one feed (AC 14)", async () => {
    const household = await seededHousehold()
    const starting = start()
    const first = await sendJson(household, "POST", "/api/feeds/start", starting)
    vi.setSystemTime(NOW + 30_000)
    expect(await sendJson(household, "POST", "/api/feeds/start", starting)).toEqual(first)
    expect(first.status).toBe(201)
    expect(await inStorage(household, (sql) => sql.exec("SELECT id FROM feeds").toArray().length)).toBe(1)
  })

  it("answer a retried start with edited values with 409 ACTION_REPLAY_MISMATCH and the saved feed, saving nothing new", async () => {
    const household = await seededHousehold()
    const starting = start()
    const first = decodeSaved((await sendJson(household, "POST", "/api/feeds/start", starting)).body)
    expect(await sendJson(household, "POST", "/api/feeds/start", { ...starting, side: "right" })).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first.feed },
    })
    const sides = await inStorage(household, (sql) => sql.exec("SELECT side FROM nursing_segments").toArray())
    expect(sides).toEqual([{ side: "left" }])
  })

  it("let only one of two parents start a feed at the same moment, and answer the other 409 FEED_ALREADY_ACTIVE (AC 13)", async () => {
    const household = await seededHousehold()
    const [andrews, emilys] = await Promise.all([
      sendJson(household, "POST", "/api/feeds/start", start(minutesAgo(1)), ANDREW.email),
      sendJson(household, "POST", "/api/feeds/start", start(minutesAgo(1)), EMILY.email),
    ])
    expect([andrews.status, emilys.status].toSorted()).toEqual([201, 409])
    const [saved, refused] = andrews.status === 201 ? [andrews, emilys] : [emilys, andrews]
    expect(refused.body).toEqual({
      _tag: "Conflict",
      code: "FEED_ALREADY_ACTIVE",
      current: decodeSaved(saved.body).feed,
    })
  })

  it("answer 400 naming each bad field, whether the schema or the household finds it", async () => {
    const household = await seededHousehold()
    const entry = {
      actionId: crypto.randomUUID(),
      segments: [],
      portions: [{ occurredAt: minutesAgo(5), breastMilkMl: 0, formulaMl: 0 }],
    }
    expect(await sendJson(household, "POST", "/api/feeds", entry)).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "portions.0.breastMilkMl", issue: "invalid" },
          { path: "portions.0.formulaMl", issue: "invalid" },
        ],
      },
    })
    expect(await sendJson(household, "POST", "/api/feeds/start", start(NOW + 6 * MINUTE_MS))).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "startedAt", issue: "in_future" }] },
    })
  })

  it("refuse a stranger with 401 before looking at their input, which is malformed", async () => {
    const response = await send(
      await seededHousehold(),
      "POST",
      "/api/feeds/start",
      "{not json",
      "stranger@example.test",
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })
})

describe("the running feed's endpoints", () => {
  it("let only one of two parents' switches from the same version through, and answer the other 409 STALE_VERSION (AC 13)", async () => {
    const household = await seededHousehold()
    const feed = await savedFeed(household, "POST", "/api/feeds/start", start())
    const switching = (occurredAt: number) => ({ actionId: crypto.randomUUID(), version: 1, occurredAt })
    const path = `/api/feeds/${feed.id}/switch`
    const [andrews, emilys] = await Promise.all([
      sendJson(household, "POST", path, switching(minutesAgo(15)), ANDREW.email),
      sendJson(household, "POST", path, switching(minutesAgo(14)), EMILY.email),
    ])
    expect([andrews.status, emilys.status].toSorted()).toEqual([200, 409])
    const [saved, refused] = andrews.status === 200 ? [andrews, emilys] : [emilys, andrews]
    expect(refused.body).toEqual({ _tag: "Conflict", code: "STALE_VERSION", current: decodeSaved(saved.body).feed })
    const running = await inStorage(household, (sql) =>
      sql.exec("SELECT id FROM nursing_segments WHERE ended_at IS NULL").toArray(),
    )
    expect(running).toHaveLength(1)
  })

  it("answer FEED_EMPTY for a finish corrected back to the start, delete the feed when told to, and restore it running", async () => {
    const household = await seededHousehold()
    const feed = await savedFeed(household, "POST", "/api/feeds/start", start(minutesAgo(30)))
    const finish = (deleteIfEmpty: boolean) => ({
      actionId: crypto.randomUUID(),
      version: 1,
      occurredAt: minutesAgo(30),
      deleteIfEmpty,
    })
    expect(await sendJson(household, "POST", `/api/feeds/${feed.id}/finish`, finish(false))).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "FEED_EMPTY", current: feed },
    })
    const deleted = await sendJson(household, "POST", `/api/feeds/${feed.id}/finish`, finish(true))
    expect(deleted).toEqual({
      status: 200,
      body: { feed: { ...feed, version: 2, deletedAt: NOW }, changed: [...CHANGED_TODAY, ["deleted"]] },
    })
    const restore = { actionId: crypto.randomUUID(), version: 2 }
    expect(await sendJson(household, "POST", `/api/feeds/${feed.id}/restore`, restore)).toEqual({
      status: 200,
      body: { feed: { ...feed, version: 3 }, changed: [...CHANGED_TODAY, ["deleted"]] },
    })
  })

  it.each([
    ["a feed", "POST", "/api/feeds/no-such-feed/pause", { version: 1, occurredAt: NOW }],
    [
      "a segment",
      "PATCH",
      "/api/segments/no-such-segment",
      { version: 1, side: "left", startedAt: NOW, endedAt: null },
    ],
    ["a bottle", "DELETE", "/api/portions/no-such-portion", { version: 1, deleteIfEmpty: false }],
  ])("answer 404 for %s no record has", async (_label, method, path, body) => {
    const household = await seededHousehold()
    await savedFeed(household, "POST", "/api/feeds/start", start())
    expect(await sendJson(household, method, path, { actionId: crypto.randomUUID(), ...body })).toEqual({
      status: 404,
      body: { _tag: "NotFound" },
    })
  })
})

describe("the receipts the feed endpoints keep", () => {
  const firstId = (records: ReadonlyArray<{ readonly id: string }>) => records[0]?.id ?? "missing"

  it("hold each request's route and the hash of its canonical body, which a retry sent before a deploy must still match", async () => {
    const household = await seededHousehold()
    const expected: Array<{ route: string; request_hash: string }> = []
    const run = async (
      route: string,
      body: (actionId: string) => Schema.Json,
      canonical: (actionId: string) => string,
    ) => {
      const actionId = crypto.randomUUID()
      expected.push({ route, request_hash: await sha256(`${route}\n${canonical(actionId)}`) })
      const [method = "", path = ""] = route.split(" ")
      const response = await sendJson(household, method, path, body(actionId))
      if (response.status >= 300)
        throw new Error(`${route} answered ${response.status}: ${JSON.stringify(response.body)}`)
      return decodeSaved(response.body).feed
    }
    const logged = await run(
      "POST /api/feeds",
      (actionId) => ({
        portions: [{ formulaMl: 20, breastMilkMl: 40, occurredAt: minutesAgo(80) }],
        segments: [{ endedAt: minutesAgo(85), startedAt: minutesAgo(100), side: "left" }],
        actionId,
      }),
      (actionId) =>
        `{"actionId":"${actionId}","segments":[{"side":"left","startedAt":${minutesAgo(100)},"endedAt":${minutesAgo(85)}}],` +
        `"portions":[{"occurredAt":${minutesAgo(80)},"breastMilkMl":40,"formulaMl":20}]}`,
    )
    const running = await run(
      "POST /api/feeds/start",
      (actionId) => ({ startedAt: minutesAgo(30), side: "left", actionId }),
      (actionId) => `{"actionId":"${actionId}","side":"left","startedAt":${minutesAgo(30)}}`,
    )
    const feedPath = `/api/feeds/${running.id}`
    await run(
      `POST ${feedPath}/switch`,
      (actionId) => ({ occurredAt: minutesAgo(25), version: 1, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":1,"occurredAt":${minutesAgo(25)}}`,
    )
    await run(
      `POST ${feedPath}/pause`,
      (actionId) => ({ occurredAt: minutesAgo(20), version: 2, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":2,"occurredAt":${minutesAgo(20)}}`,
    )
    await run(
      `POST ${feedPath}/resume`,
      (actionId) => ({ occurredAt: minutesAgo(15), side: "left", version: 3, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":3,"side":"left","occurredAt":${minutesAgo(15)}}`,
    )
    await run(
      `POST ${feedPath}/bottle`,
      (actionId) => ({ formulaMl: 0, breastMilkMl: 30.5, occurredAt: minutesAgo(10), version: 4, actionId }),
      (actionId) =>
        `{"actionId":"${actionId}","version":4,"occurredAt":${minutesAgo(10)},"breastMilkMl":30.5,"formulaMl":0}`,
    )
    const finished = await run(
      `POST ${feedPath}/finish`,
      (actionId) => ({ deleteIfEmpty: false, occurredAt: minutesAgo(5), version: 5, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":5,"occurredAt":${minutesAgo(5)},"deleteIfEmpty":false}`,
    )
    const loggedPath = `/api/feeds/${logged.id}`
    const moved = await run(
      `PATCH ${loggedPath}`,
      (actionId) => ({ startedAt: minutesAgo(110), version: 1, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":1,"startedAt":${minutesAgo(110)}}`,
    )
    await run(
      `PATCH /api/segments/${firstId(moved.segments)}`,
      (actionId) => ({ endedAt: minutesAgo(96), startedAt: minutesAgo(111), side: "right", version: 2, actionId }),
      (actionId) =>
        `{"actionId":"${actionId}","version":2,"side":"right","startedAt":${minutesAgo(111)},"endedAt":${minutesAgo(96)}}`,
    )
    await run(
      `PATCH /api/portions/${firstId(moved.portions)}`,
      (actionId) => ({ formulaMl: 25, breastMilkMl: 45, occurredAt: minutesAgo(91), version: 3, actionId }),
      (actionId) =>
        `{"actionId":"${actionId}","version":3,"occurredAt":${minutesAgo(91)},"breastMilkMl":45,"formulaMl":25}`,
    )
    await run(
      `DELETE /api/portions/${firstId(moved.portions)}`,
      (actionId) => ({ deleteIfEmpty: false, version: 4, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":4,"deleteIfEmpty":false}`,
    )
    await run(
      `DELETE /api/segments/${firstId(finished.segments)}`,
      (actionId) => ({ deleteIfEmpty: false, version: 6, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":6,"deleteIfEmpty":false}`,
    )
    await run(
      `DELETE ${loggedPath}`,
      (actionId) => ({ version: 5, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":5}`,
    )
    await run(
      `POST ${loggedPath}/restore`,
      (actionId) => ({ version: 6, actionId }),
      (actionId) => `{"actionId":"${actionId}","version":6}`,
    )
    const receipts = await inStorage(household, (sql) =>
      sql.exec("SELECT route, request_hash FROM receipts ORDER BY rowid").toArray(),
    )
    expect(receipts).toEqual(expected)
    expect(new Set(receipts.map(({ route }) => String(route).replace(/\/[0-9a-f-]{36}/g, "/:id")))).toEqual(
      new Set([
        "POST /api/feeds",
        "POST /api/feeds/start",
        "POST /api/feeds/:id/switch",
        "POST /api/feeds/:id/pause",
        "POST /api/feeds/:id/resume",
        "POST /api/feeds/:id/bottle",
        "POST /api/feeds/:id/finish",
        "PATCH /api/feeds/:id",
        "PATCH /api/segments/:id",
        "PATCH /api/portions/:id",
        "DELETE /api/portions/:id",
        "DELETE /api/segments/:id",
        "DELETE /api/feeds/:id",
        "POST /api/feeds/:id/restore",
      ]),
    )
  })

  it("decode the response and changed keys stored before a deploy, which a retry within a day of it replays", () => {
    const storedResponse =
      '{"id":"fe547ab2-e53a-463a-8baa-23087553d8ea","status":"active","startedAt":1791484200000,"endedAt":null,' +
      '"segments":[{"id":"2afe8568-09a4-4fda-b392-9def5e3dd8dd","side":"left","startedAt":1791484200000,"endedAt":null}],' +
      '"portions":[{"id":"7fa00624-087b-48dc-903e-2627b9a35dc9","occurredAt":1791485400000,"breastMilkMl":30.5,"formulaMl":20}],' +
      '"version":2,"createdBy":"51201807-bf60-4bce-bf3d-1c3dbddd5fc4","createdAt":1791486000000,' +
      '"updatedBy":"51201807-bf60-4bce-bf3d-1c3dbddd5fc4","updatedAt":1791486000000,"deletedAt":null}'
    const storedChanged =
      '[["today"],["last24h"],["day","2026-10-08"],["week","2026-W41"],["month","2026-10"],["deleted"]]'
    expect(Schema.decodeSync(Schema.fromJsonString(Feed))(storedResponse)).toEqual({
      id: "fe547ab2-e53a-463a-8baa-23087553d8ea",
      status: "active",
      startedAt: minutesAgo(30),
      endedAt: null,
      segments: [
        { id: "2afe8568-09a4-4fda-b392-9def5e3dd8dd", side: "left", startedAt: minutesAgo(30), endedAt: null },
      ],
      portions: [
        { id: "7fa00624-087b-48dc-903e-2627b9a35dc9", occurredAt: minutesAgo(10), breastMilkMl: 30.5, formulaMl: 20 },
      ],
      version: 2,
      createdBy: "51201807-bf60-4bce-bf3d-1c3dbddd5fc4",
      createdAt: NOW,
      updatedBy: "51201807-bf60-4bce-bf3d-1c3dbddd5fc4",
      updatedAt: NOW,
      deletedAt: null,
    })
    expect(Schema.decodeSync(Schema.fromJsonString(Changed))(storedChanged)).toEqual([...CHANGED_TODAY, ["deleted"]])
  })
})

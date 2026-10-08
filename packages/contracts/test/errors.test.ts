import { Effect, Exit, Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { afterAll, describe, expect, it } from "vitest"
import {
  Conflict,
  ConflictCode,
  InvalidInput,
  NotFound,
  RateLimited,
  ServiceUnavailable,
  Unauthorized,
} from "../src/index.ts"

const Feed = Schema.Struct({ id: Schema.String, version: Schema.Int })

class FeedConflict extends Conflict<FeedConflict>()(["FEED_ALREADY_ACTIVE", "STALE_VERSION"], Feed) {}

const failures = {
  unauthorized: new Unauthorized(),
  "invalid-input": new InvalidInput({ fieldErrors: [{ path: "portions.0.formulaMl", issue: "too_many_decimals" }] }),
  "not-found": new NotFound(),
  conflict: new FeedConflict({ code: "STALE_VERSION", current: { id: "feed-1", version: 3 } }),
  "rate-limited": new RateLimited(),
  "service-unavailable": new ServiceUnavailable(),
}

const FailureName = Schema.Literals([
  "unauthorized",
  "invalid-input",
  "not-found",
  "conflict",
  "rate-limited",
  "service-unavailable",
])

class ProbeGroup extends HttpApiGroup.make("probe").add(
  HttpApiEndpoint.get("fail", "/fail/:name", {
    params: { name: FailureName },
    error: [Unauthorized, InvalidInput, NotFound, FeedConflict, RateLimited, ServiceUnavailable],
  }),
) {}

class ProbeApi extends HttpApi.make("errors-probe").add(ProbeGroup) {}

const handlers = HttpApiBuilder.group(ProbeApi, "probe", (group) =>
  group.handle("fail", ({ params }) => Effect.fail(failures[params.name])),
)

const web = HttpRouter.toWebHandler(
  HttpApiBuilder.layer(ProbeApi).pipe(Layer.provide(handlers), Layer.provide(HttpServer.layerServices)),
  { disableLogger: true },
)

afterAll(() => web.dispose())

const respond = async (name: keyof typeof failures) => {
  const response = await web.handler(new Request(`https://bt.test/fail/${name}`))
  return { status: response.status, body: await response.json() }
}

describe("each ApiError sent by an http-api handler", () => {
  it("Unauthorized is a 401 with the body the Worker already sends", async () => {
    expect(await respond("unauthorized")).toEqual({ status: 401, body: { _tag: "Unauthorized" } })
  })

  it("InvalidInput is a 400 that names each field and its issue", async () => {
    expect(await respond("invalid-input")).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "portions.0.formulaMl", issue: "too_many_decimals" }] },
    })
  })

  it("NotFound is a 404", async () => {
    expect(await respond("not-found")).toEqual({ status: 404, body: { _tag: "NotFound" } })
  })

  it("a Conflict is a 409 that carries its code and the current record", async () => {
    expect(await respond("conflict")).toEqual({
      status: 409,
      body: { _tag: "Conflict", code: "STALE_VERSION", current: { id: "feed-1", version: 3 } },
    })
  })

  it("RateLimited is a 429", async () => {
    expect(await respond("rate-limited")).toEqual({ status: 429, body: { _tag: "RateLimited" } })
  })

  it("ServiceUnavailable is a 503", async () => {
    expect(await respond("service-unavailable")).toEqual({ status: 503, body: { _tag: "ServiceUnavailable" } })
  })
})

describe("conflicts", () => {
  const decodeFeedConflict = Schema.decodeUnknownExit(Schema.toCodecJson(FeedConflict))

  it("keeps the conflict codes the client relies on", () => {
    expect(ConflictCode.literals).toEqual([
      "FEED_ALREADY_ACTIVE",
      "SLEEP_ALREADY_ACTIVE",
      "SLEEP_OVERLAP",
      "SEGMENT_OVERLAP",
      "STALE_VERSION",
      "SUPPLEMENT_DUPLICATE_DAY",
      "FEED_EMPTY",
      "ACTION_REPLAY_MISMATCH",
    ])
  })

  it("decodes a 409 body back into the endpoint's conflict, with a typed current record", () => {
    const exit = decodeFeedConflict({
      _tag: "Conflict",
      code: "FEED_ALREADY_ACTIVE",
      current: { id: "feed-2", version: 1 },
    })
    expect(Exit.isSuccess(exit) && exit.value.current.id).toBe("feed-2")
  })

  it("rejects a code the endpoint does not declare", () => {
    const exit = decodeFeedConflict({ _tag: "Conflict", code: "SLEEP_OVERLAP", current: { id: "feed-2", version: 1 } })
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("rejects a current record of the wrong kind", () => {
    const exit = decodeFeedConflict({ _tag: "Conflict", code: "STALE_VERSION", current: { id: "feed-2" } })
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe("InvalidInput", () => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(InvalidInput))

  it("accepts every domain validation issue, plus invalid for input that failed decoding", () => {
    const issues = [
      "not_finite",
      "not_positive",
      "too_many_decimals",
      "end_not_after_start",
      "before_birth",
      "in_future",
      "out_of_range",
      "invalid",
    ]
    const exit = decode({ _tag: "InvalidInput", fieldErrors: issues.map((issue) => ({ path: "amount", issue })) })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("rejects an issue nobody defined", () => {
    const exit = decode({ _tag: "InvalidInput", fieldErrors: [{ path: "amount", issue: "too_big" }] })
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

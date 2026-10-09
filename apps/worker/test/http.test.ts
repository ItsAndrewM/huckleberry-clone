import { Authorization, InvalidInputs, LocalDate } from "@bt/contracts"
import { runInDurableObject } from "cloudflare:test"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { describe, expect, it } from "vitest"
import { authorization, invalidInputs } from "../src/http.ts"
import { seededHousehold } from "./fixtures.ts"

const Portion = Schema.Struct({ formulaMl: Schema.Int, date: LocalDate })

class ProbeGroup extends HttpApiGroup.make("probe").add(
  HttpApiEndpoint.post("log", "/log", {
    payload: Schema.Struct({ amount: Schema.Int, date: LocalDate, portions: Schema.Array(Portion) }),
    success: Schema.Struct({ ok: Schema.Boolean }),
  }),
) {}

class ProbeApi extends HttpApi.make("probe")
  .add(ProbeGroup)
  .middleware(InvalidInputs)
  .middleware(Authorization)
  .annotate(HttpApi.ParseOptions, { errors: "all" }) {}

const post = async (email: string, body: string) =>
  runInDurableObject(await seededHousehold(), async (_instance, state) => {
    const handlers = HttpApiBuilder.group(ProbeApi, "probe", (group) =>
      group.handle("log", () => Effect.succeed({ ok: true })),
    )
    const web = HttpRouter.toWebHandler(
      HttpApiBuilder.layer(ProbeApi).pipe(
        Layer.provide(handlers.pipe(Layer.provide([authorization(state.storage.sql), invalidInputs]))),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    const response = await web.handler(
      new Request("https://bt.example.test/log", {
        method: "POST",
        headers: { "content-type": "application/json", "x-bt-email": email },
        body,
      }),
    )
    await web.dispose()
    return { status: response.status, body: await response.json() }
  })

describe("input that fails decoding", () => {
  it("is a 400 InvalidInput that names every bad field, however deep", async () => {
    const body = JSON.stringify({ amount: "50", date: "2026-02-30", portions: [{ formulaMl: 40, date: "soon" }] })
    expect(await post("andrew@example.test", body)).toEqual({
      status: 400,
      body: {
        _tag: "InvalidInput",
        fieldErrors: [
          { path: "amount", issue: "invalid" },
          { path: "date", issue: "invalid" },
          { path: "portions.0.date", issue: "invalid" },
        ],
      },
    })
  })

  it("is a 400 InvalidInput when the body isn't JSON", async () => {
    expect(await post("andrew@example.test", "{not json")).toEqual({
      status: 400,
      body: { _tag: "InvalidInput", fieldErrors: [{ path: "", issue: "invalid" }] },
    })
  })

  it("is a 401 when the caller isn't a caregiver, who learns nothing about their input", async () => {
    expect(await post("stranger@example.test", "{not json")).toEqual({ status: 401, body: { _tag: "Unauthorized" } })
  })
})

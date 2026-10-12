import { Context } from "effect"
import { HttpApi, OpenApi } from "effect/http-api"
import { describe, expect, it } from "vitest"
import { Api, Authorization, InvalidInputs } from "../src/index.ts"

const endpoints = Object.values(Api.groups).flatMap((group) => Object.values(group.endpoints))

describe("the API the household serves", () => {
  it("has exactly these endpoints, so the checks below can't pass on an empty list", () => {
    expect(endpoints.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/me",
      "PATCH /api/household",
      "PATCH /api/child",
      "GET /api/today",
      "GET /api/last24h",
      "POST /api/diapers",
      "PATCH /api/diapers/:id",
      "DELETE /api/diapers/:id",
      "POST /api/diapers/:id/restore",
      "POST /api/feeds",
      "POST /api/feeds/start",
      "POST /api/feeds/:id/switch",
      "POST /api/feeds/:id/pause",
      "POST /api/feeds/:id/resume",
      "POST /api/feeds/:id/bottle",
      "POST /api/feeds/:id/finish",
      "PATCH /api/feeds/:id",
      "DELETE /api/feeds/:id",
      "POST /api/feeds/:id/restore",
      "PATCH /api/segments/:id",
      "DELETE /api/segments/:id",
      "PATCH /api/portions/:id",
      "DELETE /api/portions/:id",
      "GET /api/growth",
      "POST /api/growth",
      "PATCH /api/growth/:id",
      "DELETE /api/growth/:id",
      "POST /api/growth/:id/restore",
      "GET /api/export.json",
      "GET /api/export.csv",
    ])
  })

  it("has every endpoint under /api/, and none under /api/admin, which the Worker keeps for itself", () => {
    const paths = endpoints.map(({ path }) => path)
    expect(paths.every((path) => path.startsWith("/api/") && !path.startsWith("/api/admin"))).toBe(true)
  })

  it("checks the caller and then the input on every endpoint, since the last middleware added runs first", () => {
    for (const endpoint of endpoints) expect([...endpoint.middlewares]).toEqual([InvalidInputs, Authorization])
  })

  it("names each record's 409 after its conflict class in docs/api.json, though each says Conflict on the wire", () => {
    expect(Object.keys(OpenApi.fromApi(Api).components.schemas).toSorted()).toEqual([
      "ChildConflictEncoded",
      "DiaperConflictEncoded",
      "FeedConflictEncoded",
      "HouseholdConflictEncoded",
      "InvalidInputEncoded",
      "MeasurementConflictEncoded",
      "NotFoundEncoded",
      "UnauthorizedEncoded",
    ])
  })

  it("lists every bad field in a request, not just the first", () => {
    expect(Context.getOrUndefined(Api.annotations, HttpApi.ParseOptions)).toEqual({ errors: "all" })
  })
})

import { Context } from "effect"
import { HttpApi } from "effect/http-api"
import { describe, expect, it } from "vitest"
import { Api, Authorization, InvalidInputs } from "../src/index.ts"

const endpoints = Object.values(Api.groups).flatMap((group) => Object.values(group.endpoints))

describe("the API the household serves", () => {
  it("has every endpoint under /api/, and none under /api/admin, which the Worker keeps for itself", () => {
    const paths = endpoints.map(({ path }) => path)
    expect(paths.every((path) => path.startsWith("/api/") && !path.startsWith("/api/admin"))).toBe(true)
  })

  it("checks the caller and then the input on every endpoint, since the last middleware added runs first", () => {
    for (const endpoint of endpoints) expect([...endpoint.middlewares]).toEqual([InvalidInputs, Authorization])
  })

  it("lists every bad field in a request, not just the first", () => {
    expect(Context.getOrUndefined(Api.annotations, HttpApi.ParseOptions)).toEqual({ errors: "all" })
  })
})

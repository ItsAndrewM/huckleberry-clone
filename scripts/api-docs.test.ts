import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { apiDocument } from "../packages/contracts/src/openapi.ts"

it("docs/api.json matches the API definition (pnpm api:docs rewrites it)", () => {
  expect(readFileSync(new URL("../docs/api.json", import.meta.url), "utf8")).toBe(apiDocument())
})

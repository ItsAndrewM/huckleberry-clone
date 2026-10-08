import { beforeAll, describe, expect, it } from "vitest"
import { lintProbes } from "./lint-probes.ts"

const CASES = [
  { dir: "packages/contracts/src", schema: "Schema.Number", rejected: true },
  { dir: "packages/contracts/src", schema: "Schema.NumberFromString", rejected: true },
  { dir: "apps/worker/src", schema: "Schema.Number", rejected: true },
  { dir: "apps/web/src", schema: "Schema.Number", rejected: true },
  { dir: "packages/contracts/src", schema: "Schema.Finite", rejected: false },
  { dir: "packages/contracts/src", schema: "Schema.Int", rejected: false },
  { dir: "packages/contracts/src", schema: "Schema.FiniteFromString", rejected: false },
].map((probe, i) => ({
  ...probe,
  path: `${probe.dir}/schema-probe-${i}.ts`,
  source: `import { Schema } from "effect"\nexport const amount = ${probe.schema}\n`,
}))

describe("numbers in schemas, which must be finite", () => {
  let flagged: ReadonlySet<string>
  beforeAll(() => {
    flagged = new Set(
      lintProbes(CASES)
        .filter((d) => d.code === "eslint(no-restricted-properties)")
        .map((d) => d.filename),
    )
  })

  it.each(CASES)("$dir: $schema → rejected: $rejected", ({ path, rejected }) => {
    expect(flagged.has(path)).toBe(rejected)
  })
})

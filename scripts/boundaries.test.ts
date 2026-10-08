import { beforeAll, describe, expect, it } from "vitest"
import { lintProbes } from "./lint-probes.ts"

const CASES = [
  { dir: "apps/web/src", specifier: "@bt/worker", rejected: true },
  { dir: "apps/web/src", specifier: "../../worker/src/index.ts", rejected: true },
  { dir: "apps/web/src/features/today", specifier: "../../../../worker/src/index.ts", rejected: true },
  { dir: "apps/web/src", specifier: "date-fns", rejected: true },
  { dir: "apps/worker/src", specifier: "@bt/web", rejected: true },
  { dir: "apps/worker/src", specifier: "../../web/src/App.tsx", rejected: true },
  { dir: "apps/worker/src", specifier: "@date-fns/tz", rejected: true },
  { dir: "packages/domain/src", specifier: "@bt/contracts", rejected: true },
  { dir: "packages/domain/src", specifier: "../../contracts/src/index.ts", rejected: true },
  { dir: "packages/domain/src/time", specifier: "../../../../apps/worker/src/index.ts", rejected: true },
  { dir: "packages/domain/src", specifier: "effect", rejected: true },
  { dir: "packages/contracts/src", specifier: "@bt/worker", rejected: true },
  { dir: "packages/contracts/src", specifier: "../../../apps/web/src/App.tsx", rejected: true },
  { dir: "packages/contracts/src", specifier: "date-fns", rejected: true },
  { dir: "packages/domain/src", specifier: "date-fns", rejected: false },
  { dir: "packages/domain/src/aggregate", specifier: "../time/zoned.ts", rejected: false },
  { dir: "apps/web/src", specifier: "./service-worker/register.ts", rejected: false },
  { dir: "apps/web/src", specifier: "some-lib/worker/index.js", rejected: false },
  { dir: "apps/web/src", specifier: "@bt/domain", rejected: false },
  { dir: "apps/worker/src", specifier: "@bt/contracts", rejected: false },
  { dir: "packages/contracts/src", specifier: "@bt/domain", rejected: false },
].map((probe, i) => ({ ...probe, path: `${probe.dir}/probe-${i}.ts` }))

const filesWithRestrictedImports = (): ReadonlySet<string> =>
  new Set(
    lintProbes(CASES.map(({ path, specifier }) => ({ path, source: `import "${specifier}"\n` })))
      .filter((d) => d.code === "eslint(no-restricted-imports)")
      .map((d) => d.filename),
  )

describe("import boundaries (plan §1, D12)", () => {
  let flagged: ReadonlySet<string>
  beforeAll(() => {
    flagged = filesWithRestrictedImports()
  })

  it.each(CASES)("$dir: import $specifier → rejected: $rejected", ({ path, rejected }) => {
    expect(flagged.has(path)).toBe(rejected)
  })
})

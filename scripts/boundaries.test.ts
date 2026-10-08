import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OXLINT = join(ROOT, "node_modules", ".bin", "oxlint")

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

interface OxlintReport {
  readonly diagnostics: ReadonlyArray<{ readonly code: string; readonly filename: string }>
}

const filesWithRestrictedImports = (): ReadonlySet<string> => {
  const dir = mkdtempSync(join(tmpdir(), "bt-boundaries-"))
  try {
    copyFileSync(join(ROOT, "oxlint.config.ts"), join(dir, "oxlint.config.ts"))
    for (const linked of ["node_modules", "tools"]) symlinkSync(join(ROOT, linked), join(dir, linked))
    for (const probe of CASES) {
      mkdirSync(join(dir, probe.dir), { recursive: true })
      writeFileSync(join(dir, probe.path), `import "${probe.specifier}"\n`)
    }
    const run = spawnSync(OXLINT, ["--format=json", ...CASES.map((probe) => probe.path)], {
      cwd: dir,
      encoding: "utf8",
    })
    if (!run.stdout.startsWith("{")) throw new Error(`oxlint printed no JSON report:\n${run.stdout}${run.stderr}`)
    // SAFETY: matches --format=json's layout; a different one throws or flags nothing, so every rejected probe fails.
    const report = JSON.parse(run.stdout) as OxlintReport
    return new Set(report.diagnostics.filter((d) => d.code === "eslint(no-restricted-imports)").map((d) => d.filename))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("import boundaries (plan §1, D12)", () => {
  let flagged: ReadonlySet<string>
  beforeAll(() => {
    flagged = filesWithRestrictedImports()
  })

  it.each(CASES)("$dir: import $specifier → rejected: $rejected", ({ path, rejected }) => {
    expect(flagged.has(path)).toBe(rejected)
  })
})

import { spawnSync } from "node:child_process"
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OXLINT = join(ROOT, "node_modules", ".bin", "oxlint")

export const VENDORED_PLUGIN = "tools/oxlint/anti-slop"

export interface Probe {
  readonly path: string
  readonly source: string
}

export interface Diagnostic {
  readonly code: string
  readonly filename: string
}

interface OxlintReport {
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

export const lintProbes = (probes: ReadonlyArray<Probe>): ReadonlyArray<Diagnostic> => {
  const dir = mkdtempSync(join(tmpdir(), "bt-lint-probes-"))
  try {
    copyFileSync(join(ROOT, "oxlint.config.ts"), join(dir, "oxlint.config.ts"))
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"))
    cpSync(join(ROOT, VENDORED_PLUGIN), join(dir, VENDORED_PLUGIN), { recursive: true })
    for (const probe of probes) {
      mkdirSync(join(dir, dirname(probe.path)), { recursive: true })
      writeFileSync(join(dir, probe.path), probe.source)
    }
    const run = spawnSync(OXLINT, ["--format=json", ...probes.map((probe) => probe.path)], {
      cwd: dir,
      encoding: "utf8",
    })
    if (!run.stdout.startsWith("{")) throw new Error(`oxlint printed no JSON report:\n${run.stdout}${run.stderr}`)
    // SAFETY: matches --format=json's layout; a different one throws or yields nothing, failing every expected finding.
    return (JSON.parse(run.stdout) as OxlintReport).diagnostics
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

import { spawnSync } from "node:child_process"
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { builtWorkerConfig } from "./bundle-size.ts"
import {
  CI_WORKFLOW,
  checkoutProblems,
  ciProblems,
  deployProblems,
  envFor,
  gateEnv,
  LOCAL_GATES,
  releasedReport,
  releaseFlags,
  restorePointOf,
  restorePointReport,
  uploadedVersionId,
  versionDeployArgs,
  versionUploadArgs,
} from "./release-checks.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const webDir = fileURLToPath(new URL("../apps/web/", import.meta.url))

const output = (tool: "git" | "gh", args: string[]): string => {
  const run = spawnSync(tool, args, { cwd: rootDir, env: envFor(tool, process.env), encoding: "utf8" })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`${tool} ${args.join(" ")} failed:\n${run.stdout}${run.stderr}`)
  return run.stdout.trim()
}

const pnpm = (tool: "build" | "wrangler", args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): void => {
  const run = spawnSync("pnpm", args, { cwd, env: { ...envFor(tool, process.env), ...extraEnv }, stdio: "inherit" })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) process.exit(run.status ?? 1)
}

const report = (paragraphs: string): void => {
  console.log(paragraphs)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary !== undefined) appendFileSync(summary, `${paragraphs}\n\n`)
}

const stopUnless = (problems: string[]): void => {
  if (problems.length === 0) return
  console.error(
    `Not releasing. Each of these must hold first:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
  )
  process.exit(1)
}

const runGatesHere = (): void => {
  for (const gate of LOCAL_GATES) {
    const run = spawnSync("pnpm", [...gate], { cwd: rootDir, env: gateEnv(process.env), stdio: "inherit" })
    if (run.error !== undefined) throw run.error
    stopUnless(run.status === 0 ? [] : [`\`pnpm ${gate.join(" ")}\` passes on this checkout`])
  }
}

const ciRunsOn = (commit: string) =>
  JSON.parse(
    output("gh", [
      "run",
      "list",
      "--commit",
      commit,
      "--workflow",
      CI_WORKFLOW,
      "--json",
      "status,conclusion,createdAt",
    ]),
  )

const flags = releaseFlags(process.argv.slice(2))
const head = output("git", ["rev-parse", "HEAD"])
stopUnless(
  checkoutProblems({
    clean: output("git", ["status", "--porcelain"]) === "",
    head,
    originMain: output("gh", ["api", "repos/{owner}/{repo}/commits/main", "--jq", ".sha"]),
  }),
)
if (flags.gatesLocal) runGatesHere()
else stopUnless(ciProblems(ciRunsOn(head)))

pnpm("build", ["build"], rootDir)
const config = builtWorkerConfig(webDir)
stopUnless(deployProblems(JSON.parse(readFileSync(config, "utf8"))))

const runId = process.env.GITHUB_RUN_ID
const outputDir = mkdtempSync(join(tmpdir(), "bt-release-"))
const outputFile = join(outputDir, "wrangler-output.ndjson")
const gatesLocal = flags.gatesLocal
pnpm("wrangler", ["exec", "wrangler", ...versionUploadArgs({ config, commit: head, runId, gatesLocal })], webDir, {
  WRANGLER_OUTPUT_FILE_PATH: outputFile,
})
const versionId = uploadedVersionId(readFileSync(outputFile, "utf8"))
rmSync(outputDir, { recursive: true, force: true })

const restorePoint = restorePointOf(new Date())
report(restorePointReport(restorePoint))
pnpm(
  "wrangler",
  ["exec", "wrangler", ...versionDeployArgs({ config, versionId, commit: head, restorePoint, runId, gatesLocal })],
  webDir,
)
report(releasedReport(head))

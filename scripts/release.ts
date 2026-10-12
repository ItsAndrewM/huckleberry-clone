import { spawnSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { builtWorkerConfig } from "./bundle-size.ts"
import {
  CI_WORKFLOW,
  checkoutProblems,
  ciProblems,
  deployProblems,
  envFor,
  refuseUnknownFlags,
  releaseReport,
  restorePointOf,
  wranglerDeployArgs,
} from "./release-checks.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const webDir = fileURLToPath(new URL("../apps/web/", import.meta.url))

const output = (tool: "git" | "gh", args: string[]): string => {
  const run = spawnSync(tool, args, { cwd: rootDir, env: envFor(tool, process.env), encoding: "utf8" })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`${tool} ${args.join(" ")} failed:\n${run.stdout}${run.stderr}`)
  return run.stdout.trim()
}

const pnpm = (tool: "build" | "wrangler", args: string[], cwd: string): void => {
  const run = spawnSync("pnpm", args, { cwd, env: envFor(tool, process.env), stdio: "inherit" })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) process.exit(run.status ?? 1)
}

const stopUnless = (problems: string[]): void => {
  if (problems.length === 0) return
  console.error(
    `Not releasing. Each of these must hold first:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
  )
  process.exit(1)
}

refuseUnknownFlags(process.argv.slice(2))

output("git", ["fetch", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main"])
const head = output("git", ["rev-parse", "HEAD"])
stopUnless(
  checkoutProblems({
    clean: output("git", ["status", "--porcelain"]) === "",
    head,
    originMain: output("git", ["rev-parse", "origin/main"]),
  }),
)
stopUnless(
  ciProblems(
    JSON.parse(
      output("gh", [
        "run",
        "list",
        "--commit",
        head,
        "--workflow",
        CI_WORKFLOW,
        "--json",
        "status,conclusion,createdAt",
      ]),
    ),
  ),
)

pnpm("build", ["build"], rootDir)
const config = builtWorkerConfig(webDir)
stopUnless(deployProblems(JSON.parse(readFileSync(config, "utf8"))))

const restorePoint = restorePointOf(new Date())
pnpm(
  "wrangler",
  ["exec", "wrangler", ...wranglerDeployArgs({ config, commit: head, restorePoint, runId: process.env.GITHUB_RUN_ID })],
  webDir,
)

const report = releaseReport(head, restorePoint)
console.log(report)
const summary = process.env.GITHUB_STEP_SUMMARY
if (summary !== undefined) appendFileSync(summary, `${report}\n`)

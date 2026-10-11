import { spawnSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { adminRequest } from "./admin-seed.ts"
import { builtWorkerConfig } from "./bundle-size.ts"
import {
  bookmarkFrom,
  checkoutProblems,
  ciProblems,
  deployLogLine,
  deployProblems,
  PRODUCTION_HOSTNAME,
  withoutCloudflareEnv,
} from "./release-checks.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const webDir = fileURLToPath(new URL("../apps/web/", import.meta.url))
const env = withoutCloudflareEnv(process.env)

const output = (command: string, args: string[]): string => {
  const run = spawnSync(command, args, { cwd: rootDir, env, encoding: "utf8" })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${run.stdout}${run.stderr}`)
  return run.stdout.trim()
}

const step = (command: string, args: string[], cwd = rootDir): void => {
  const run = spawnSync(command, args, { cwd, env, stdio: "inherit" })
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

const { values } = parseArgs({ options: { first: { type: "boolean", default: false } }, strict: true })

output("git", ["fetch", "--quiet", "origin", "main"])
const head = output("git", ["rev-parse", "HEAD"])
stopUnless(
  checkoutProblems({
    branch: output("git", ["branch", "--show-current"]),
    clean: output("git", ["status", "--porcelain"]) === "",
    head,
    originMain: output("git", ["rev-parse", "origin/main"]),
  }),
)
stopUnless(
  ciProblems(
    JSON.parse(
      output("gh", ["run", "list", "--commit", head, "--workflow", "CI", "--json", "status,conclusion,createdAt"]),
    ),
  ),
)

step("pnpm", ["build"])
const config = builtWorkerConfig(webDir)
stopUnless(deployProblems(JSON.parse(readFileSync(config, "utf8"))))

const bookmarkResponse = values.first ? null : await fetch(adminRequest(process.env, "/api/admin/pitr/bookmark"))
const bookmark = bookmarkResponse === null ? null : bookmarkFrom(bookmarkResponse.status, await bookmarkResponse.text())
if (bookmark !== null) console.log(`Bookmark before this deploy: ${bookmark}`)

step("pnpm", ["exec", "wrangler", "deploy", "--config", config], webDir)
appendFileSync(new URL("../deploys.log", import.meta.url), deployLogLine(new Date(), head, bookmark))
console.log(`Released ${head.slice(0, 7)} to https://${PRODUCTION_HOSTNAME}. Logged in deploys.log.`)
console.log("Open the app online on each phone, so its offline copy updates to this build.")

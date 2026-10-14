import { parseArgs } from "node:util"

export const PRODUCTION_NAME = "baby-tracker"
export const PRODUCTION_HOSTNAME = "baby.andamonium.dev"
export const PRODUCTION_ACCOUNT_ID = "6624f09210327baade61004af0d9be84"
export const CI_WORKFLOW = "CI"

export interface DeployConfig {
  readonly name?: string
  readonly account_id?: string
  readonly routes?: ReadonlyArray<{ readonly pattern?: string; readonly custom_domain?: boolean }>
  readonly workers_dev?: boolean
  readonly preview_urls?: boolean
  readonly vars?: {
    readonly ACCESS_AUD?: string
    readonly ADMIN_SERVICE_TOKEN_CN?: string
    readonly LOCAL_HOUSEHOLD?: { readonly name?: string }
  }
  readonly observability?: { readonly logs?: { readonly invocation_logs?: boolean } }
}

export interface Checkout {
  readonly clean: boolean
  readonly head: string
  readonly originMain: string
}

export interface CiRun {
  readonly status: string
  readonly conclusion: string
  readonly createdAt: string
}

export interface Upload {
  readonly config: string
  readonly commit: string
  readonly runId: string | undefined
}

export interface Rollout extends Upload {
  readonly versionId: string
  readonly restorePoint: string
}

interface WranglerOutputEntry {
  readonly type?: string
  readonly version_id?: string
}

type Check<A> = readonly [expectation: string, holds: (value: A) => boolean]

const problemsOf = <A>(checks: ReadonlyArray<Check<A>>, value: A): string[] =>
  checks.filter(([, holds]) => !holds(value)).map(([expectation]) => expectation)

const onlyRouteIsTheHostname = (config: DeployConfig): boolean =>
  config.routes?.length === 1 &&
  config.routes[0]?.pattern === PRODUCTION_HOSTNAME &&
  config.routes[0]?.custom_domain === true

const DEPLOY_CHECKS: ReadonlyArray<Check<DeployConfig>> = [
  [
    `the Worker is ${PRODUCTION_NAME}, not a local build (rebuild without CLOUDFLARE_ENV)`,
    (config) => config.name === PRODUCTION_NAME,
  ],
  [
    `account_id is ${PRODUCTION_ACCOUNT_ID}, the production account`,
    (config) => config.account_id === PRODUCTION_ACCOUNT_ID,
  ],
  [`its only route is the Custom Domain ${PRODUCTION_HOSTNAME}`, onlyRouteIsTheHostname],
  ["workers.dev is off", (config) => config.workers_dev === false],
  ["preview URLs are off", (config) => config.preview_urls === false],
  ["ACCESS_AUD is set", (config) => (config.vars?.ACCESS_AUD ?? "") !== ""],
  ["ADMIN_SERVICE_TOKEN_CN is set", (config) => (config.vars?.ADMIN_SERVICE_TOKEN_CN ?? "") !== ""],
  ["no made-up LOCAL_HOUSEHOLD is seeded", (config) => config.vars?.LOCAL_HOUSEHOLD === undefined],
  ["Cloudflare's per-request logs are off", (config) => config.observability?.logs?.invocation_logs === false],
]

const CHECKOUT_CHECKS: ReadonlyArray<Check<Checkout>> = [
  ["the checkout has no uncommitted changes", (checkout) => checkout.clean],
  ["HEAD is the same commit as origin/main", (checkout) => checkout.head === checkout.originMain],
]

export const refuseUnknownFlags = (args: ReadonlyArray<string>): void => {
  parseArgs({ args: [...args], strict: true })
}

export const deployProblems = (config: DeployConfig): string[] => problemsOf(DEPLOY_CHECKS, config)

export const checkoutProblems = (checkout: Checkout): string[] => problemsOf(CHECKOUT_CHECKS, checkout)

const newestFirst = (a: CiRun, b: CiRun): number => b.createdAt.localeCompare(a.createdAt)

export const ciProblems = (runs: ReadonlyArray<CiRun>): string[] => {
  const [latest] = [...runs].sort(newestFirst)
  if (latest === undefined) return ["CI has run on this commit"]
  if (runs.some((run) => run.status !== "completed")) return ["CI has finished on this commit"]
  return latest.conclusion === "success" ? [] : ["CI passed on this commit"]
}

const DROPPED = {
  git: ["CLOUDFLARE_ENV", "CLOUDFLARE_API_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
  gh: ["CLOUDFLARE_ENV", "CLOUDFLARE_API_TOKEN"],
  build: ["CLOUDFLARE_ENV", "CLOUDFLARE_API_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
  wrangler: ["CLOUDFLARE_ENV", "GH_TOKEN", "GITHUB_TOKEN"],
} as const

export type Tool = keyof typeof DROPPED

export const envFor = (tool: Tool, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const dropped = new Set<string>(DROPPED[tool])
  return Object.fromEntries(Object.entries(env).filter(([name]) => !dropped.has(name)))
}

export const restorePointOf = (at: Date): string => `${at.toISOString().slice(0, 19)}Z`

const sourceOf = (runId: string | undefined): string => (runId === undefined ? "local" : `ci:${runId}`)

export const versionUploadArgs = ({ config, commit, runId }: Upload): string[] => [
  "versions",
  "upload",
  "--config",
  config,
  "--tag",
  commit,
  "--message",
  `${commit.slice(0, 7)} ${sourceOf(runId)}`,
]

export const uploadedVersionId = (output: string): string => {
  const entries: ReadonlyArray<WranglerOutputEntry> = output
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line))
  const versionId = entries.find((entry) => entry.type === "version-upload")?.version_id ?? ""
  if (versionId === "") throw new Error("Wrangler reported no uploaded version in its output file")
  return versionId
}

export const versionDeployArgs = ({ config, versionId, commit, restorePoint, runId }: Rollout): string[] => [
  "versions",
  "deploy",
  `${versionId}@100%`,
  "--config",
  config,
  "--message",
  `${commit.slice(0, 7)} restore point ${restorePoint} ${sourceOf(runId)}`,
  "--yes",
]

export const restorePointReport = (restorePoint: string): string =>
  `Restore point: ${restorePoint}. To rewind the household to just before this deploy, run \`pnpm admin pitr:restore --at ${restorePoint}\`.`

export const releasedReport = (commit: string): string =>
  [
    `Released ${commit.slice(0, 7)} to https://${PRODUCTION_HOSTNAME}.`,
    "Each phone saves this build the next time it's online, and opens it the next time the app comes back online with nothing open. Settings › Offline copy says when a newer version is waiting.",
  ].join("\n\n")

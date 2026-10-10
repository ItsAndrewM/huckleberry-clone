export const PRODUCTION_NAME = "baby-tracker"
export const PRODUCTION_HOSTNAME = "baby.andamonium.dev"

const BOOKMARK_FORMAT = /^[0-9a-f]+(?:-[0-9a-f]+)+$/

export interface DeployConfig {
  readonly name?: string
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
  readonly branch: string
  readonly clean: boolean
  readonly head: string
  readonly originMain: string
}

export interface CiRun {
  readonly status: string
  readonly conclusion: string
  readonly createdAt: string
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
  [`its only route is the Custom Domain ${PRODUCTION_HOSTNAME}`, onlyRouteIsTheHostname],
  ["workers.dev is off", (config) => config.workers_dev === false],
  ["preview URLs are off", (config) => config.preview_urls === false],
  ["ACCESS_AUD is set", (config) => (config.vars?.ACCESS_AUD ?? "") !== ""],
  ["ADMIN_SERVICE_TOKEN_CN is set", (config) => (config.vars?.ADMIN_SERVICE_TOKEN_CN ?? "") !== ""],
  ["no made-up LOCAL_HOUSEHOLD is seeded", (config) => config.vars?.LOCAL_HOUSEHOLD === undefined],
  ["Cloudflare's per-request logs are off", (config) => config.observability?.logs?.invocation_logs === false],
]

const CHECKOUT_CHECKS: ReadonlyArray<Check<Checkout>> = [
  ["the checkout is on main", (checkout) => checkout.branch === "main"],
  ["the checkout has no uncommitted changes", (checkout) => checkout.clean],
  ["main is the same commit as origin/main", (checkout) => checkout.head === checkout.originMain],
]

export const deployProblems = (config: DeployConfig): string[] => problemsOf(DEPLOY_CHECKS, config)

export const checkoutProblems = (checkout: Checkout): string[] => problemsOf(CHECKOUT_CHECKS, checkout)

const newestFirst = (a: CiRun, b: CiRun): number => b.createdAt.localeCompare(a.createdAt)

export const ciProblems = (runs: ReadonlyArray<CiRun>): string[] => {
  const [latest] = [...runs].sort(newestFirst)
  if (latest === undefined) return ["CI has run on this commit"]
  if (runs.some((run) => run.status !== "completed")) return ["CI has finished on this commit"]
  return latest.conclusion === "success" ? [] : ["CI passed on this commit"]
}

export const withoutCloudflareEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(env).filter(([name]) => name !== "CLOUDFLARE_ENV"))

const bookmarkIn = (body: string): string | undefined => {
  try {
    const parsed: { readonly bookmark?: string } = JSON.parse(body)
    return parsed.bookmark
  } catch {
    return undefined
  }
}

export const bookmarkFrom = (status: number, body: string): string => {
  const bookmark = status === 200 ? bookmarkIn(body) : undefined
  if (bookmark === undefined || !BOOKMARK_FORMAT.test(bookmark)) {
    throw new Error(`Couldn't take a bookmark before deploying: ${status} ${body}`)
  }
  return bookmark
}

export const deployLogLine = (at: Date, commit: string, bookmark: string | null): string =>
  `${at.toISOString()} ${commit} ${bookmark ?? "first-deploy-no-bookmark"}\n`

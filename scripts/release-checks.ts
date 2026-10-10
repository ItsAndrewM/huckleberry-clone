export const PRODUCTION_NAME = "baby-tracker"
export const PRODUCTION_HOSTNAME = "baby.andamonium.dev"

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

export const deployProblems = (config: DeployConfig): string[] => problemsOf(DEPLOY_CHECKS, config)

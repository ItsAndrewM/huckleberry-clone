import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { restoreFromArgs } from "./admin-pitr.ts"
import {
  type Checkout,
  checkoutProblems,
  ciProblems,
  type DeployConfig,
  deployProblems,
  envFor,
  refuseUnknownFlags,
  releaseReport,
  restorePointOf,
  wranglerDeployArgs,
} from "./release-checks.ts"

const COMMIT = "20390a32dd62e7c7a4b1f0e9d8c7b6a5f4e3d2c1"

const DEPLOYABLE: DeployConfig = {
  name: "baby-tracker",
  account_id: "6624f09210327baade61004af0d9be84",
  routes: [{ pattern: "baby.andamonium.dev", custom_domain: true }],
  workers_dev: false,
  preview_urls: false,
  vars: { ACCESS_AUD: "941d341f", ADMIN_SERVICE_TOKEN_CN: "a1b2c3.access" },
  observability: { logs: { invocation_logs: false } },
}

const AT_ORIGIN_MAIN: Checkout = { clean: true, head: "7321bf2", originMain: "7321bf2" }

describe("the Worker config a release deploys", () => {
  it("passes as built for production", () => {
    expect(deployProblems(DEPLOYABLE)).toEqual([])
  })

  it("passes as committed in apps/worker/wrangler.jsonc", () => {
    const path = new URL("../apps/worker/wrangler.jsonc", import.meta.url)
    const { config, error } = ts.parseConfigFileTextToJson(path.pathname, readFileSync(path, "utf8"))
    expect(error).toBeUndefined()
    expect(deployProblems(config)).toEqual([])
  })

  it.each([
    [
      "a local build, whose name and made-up household E2E left behind",
      { name: "baby-tracker-local", vars: { ...DEPLOYABLE.vars, LOCAL_HOUSEHOLD: { name: "Local household" } } },
      [
        "the Worker is baby-tracker, not a local build (rebuild without CLOUDFLARE_ENV)",
        "no made-up LOCAL_HOUSEHOLD is seeded",
      ],
    ],
    [
      "an empty account_id, which CI's token for one Worker can't look up",
      { account_id: "" },
      ["account_id is pinned"],
    ],
    [
      "workers.dev or preview URLs, which Access doesn't cover",
      { workers_dev: true, preview_urls: true },
      ["workers.dev is off", "preview URLs are off"],
    ],
    [
      "a route that isn't the Custom Domain",
      { routes: [{ pattern: "baby.andamonium.dev/*" }] },
      ["its only route is the Custom Domain baby.andamonium.dev"],
    ],
    [
      "a second route",
      { routes: [...(DEPLOYABLE.routes ?? []), { pattern: "baby.example.test", custom_domain: true }] },
      ["its only route is the Custom Domain baby.andamonium.dev"],
    ],
    [
      "empty Access settings, which refuse every caller",
      { vars: { ACCESS_AUD: "", ADMIN_SERVICE_TOKEN_CN: "" } },
      ["ACCESS_AUD is set", "ADMIN_SERVICE_TOKEN_CN is set"],
    ],
    [
      "Cloudflare's per-request logs, which would store the Access JWT and the email",
      { observability: { logs: { invocation_logs: true } } },
      ["Cloudflare's per-request logs are off"],
    ],
    [
      "no observability settings, which keep per-request logs",
      { observability: {} },
      ["Cloudflare's per-request logs are off"],
    ],
  ])("refuses %s", (_label, change, problems) => {
    expect(deployProblems({ ...DEPLOYABLE, ...change })).toEqual(problems)
  })
})

describe("the flags pnpm release takes", () => {
  it("takes none", () => {
    expect(() => refuseUnknownFlags([])).not.toThrow()
  })

  it.each(["--first", "--skip-export"])("refuses %s, which M5.7 removed, rather than ignoring it", (flag) => {
    expect(() => refuseUnknownFlags([flag])).toThrow(`Unknown option '${flag}'`)
  })
})

describe("the checkout a release deploys from", () => {
  it("passes on a clean checkout at origin/main's head, on a branch or on CI's checkout of a commit", () => {
    expect(checkoutProblems(AT_ORIGIN_MAIN)).toEqual([])
  })

  it.each([
    ["uncommitted changes", { clean: false }, ["the checkout has no uncommitted changes"]],
    [
      "a commit behind or ahead of origin/main, such as an old CI run re-run after main moved on",
      { originMain: "2eee922" },
      ["HEAD is the same commit as origin/main"],
    ],
  ])("refuses %s", (_label, change, problems) => {
    expect(checkoutProblems({ ...AT_ORIGIN_MAIN, ...change })).toEqual(problems)
  })
})

describe("CI on the commit a release deploys", () => {
  const EARLIER = "2026-10-10T18:00:00Z"
  const LATER = "2026-10-10T19:00:00Z"
  const run = (conclusion: string, createdAt: string) => ({ status: "completed", conclusion, createdAt })

  it("passes once a run has finished green", () => {
    expect(ciProblems([run("success", EARLIER)])).toEqual([])
  })

  it("passes when a later run went green after a red one, however the runs are listed", () => {
    expect(ciProblems([run("failure", EARLIER), run("success", LATER)])).toEqual([])
    expect(ciProblems([run("success", LATER), run("failure", EARLIER)])).toEqual([])
  })

  it.each([
    ["no run yet", [], ["CI has run on this commit"]],
    [
      "a run still going",
      [{ status: "in_progress", conclusion: "", createdAt: EARLIER }],
      ["CI has finished on this commit"],
    ],
    ["a red run", [run("failure", EARLIER)], ["CI passed on this commit"]],
    ["a cancelled run", [run("cancelled", EARLIER)], ["CI passed on this commit"]],
    ["a red run after a green one", [run("success", EARLIER), run("failure", LATER)], ["CI passed on this commit"]],
    [
      "a red run after a green one, listed newest first",
      [run("failure", LATER), run("success", EARLIER)],
      ["CI passed on this commit"],
    ],
  ])("refuses %s", (_label, runs, problems) => {
    expect(ciProblems(runs)).toEqual(problems)
  })
})

describe("the credentials each step of a release gets", () => {
  const SHELL = {
    PATH: "/usr/bin",
    CLOUDFLARE_ENV: "local",
    CLOUDFLARE_API_TOKEN: "cf-token",
    GH_TOKEN: "gh-token",
    GITHUB_TOKEN: "github-token",
  }

  it("gives the build no token and no CLOUDFLARE_ENV, since it runs dependency code and must build production", () => {
    expect(envFor("build", SHELL)).toEqual({ PATH: "/usr/bin" })
  })

  it("gives git no token, since the checkout carries its own credentials", () => {
    expect(envFor("git", SHELL)).toEqual({ PATH: "/usr/bin" })
  })

  it("gives gh the GitHub tokens and no Cloudflare one", () => {
    expect(envFor("gh", SHELL)).toEqual({ PATH: "/usr/bin", GH_TOKEN: "gh-token", GITHUB_TOKEN: "github-token" })
  })

  it("gives Wrangler the Cloudflare token and no GitHub one", () => {
    expect(envFor("wrangler", SHELL)).toEqual({ PATH: "/usr/bin", CLOUDFLARE_API_TOKEN: "cf-token" })
  })
})

describe("the restore point a release records", () => {
  const AT = new Date(Date.UTC(2026, 9, 12, 15, 49, 59, 812))

  it("is the UTC second, written with its zone", () => {
    expect(restorePointOf(AT)).toBe("2026-10-12T15:49:59Z")
  })

  it("is a time pnpm admin pitr:restore --at takes, at that same second", () => {
    expect(restoreFromArgs(["--at", restorePointOf(AT)])).toEqual({ at: Date.UTC(2026, 9, 12, 15, 49, 59) })
  })
})

describe("the deploy a release runs", () => {
  const DEPLOY = {
    config: "/repo/apps/web/dist/baby_tracker/wrangler.json",
    commit: COMMIT,
    restorePoint: "2026-10-12T15:49:59Z",
  }
  const valueAfter = (args: ReadonlyArray<string>, flag: string) => args[args.indexOf(flag) + 1] ?? ""

  it("tags the version with the whole commit, and puts the restore point and the CI run in its message", () => {
    expect(wranglerDeployArgs({ ...DEPLOY, runId: "18233456789" })).toEqual([
      "deploy",
      "--config",
      "/repo/apps/web/dist/baby_tracker/wrangler.json",
      "--tag",
      COMMIT,
      "--message",
      "20390a3 restore point 2026-10-12T15:49:59Z ci:18233456789",
    ])
  })

  it("says local when it runs from the Mac", () => {
    expect(valueAfter(wranglerDeployArgs({ ...DEPLOY, runId: undefined }), "--message")).toBe(
      "20390a3 restore point 2026-10-12T15:49:59Z local",
    )
  })

  it("stays within Cloudflare's 100-byte tag and 1,000-byte message", () => {
    const args = wranglerDeployArgs({ ...DEPLOY, runId: "9".repeat(20) })
    expect(Buffer.byteLength(valueAfter(args, "--tag"))).toBeLessThanOrEqual(100)
    expect(Buffer.byteLength(valueAfter(args, "--message"))).toBeLessThanOrEqual(1000)
  })
})

describe("what a release reports", () => {
  it("names the commit, the restore point and the command that rewinds to it, and reminds about the phones", () => {
    expect(releaseReport(COMMIT, "2026-10-12T15:49:59Z")).toBe(
      [
        "Released 20390a3 to https://baby.andamonium.dev.",
        "Restore point: 2026-10-12T15:49:59Z. To rewind the household to just before this deploy, run `pnpm admin pitr:restore --at 2026-10-12T15:49:59Z`.",
        "Open the app online on each phone, so its offline copy updates to this build.",
      ].join("\n\n"),
    )
  })
})
